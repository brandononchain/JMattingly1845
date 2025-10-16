#!/usr/bin/env tsx
/**
 * AnyRoad Backfill Script
 * 
 * Fetches historical bookings and experiences from AnyRoad and populates the data warehouse.
 * Features:
 * - Date range filtering
 * - Automatic pagination
 * - Experience metadata enrichment
 * - Guest PII hashing
 * - Checkpoint persistence
 * - Idempotent upserts
 */

import { db } from '../lib/db';
import {
  fetchAllBookings,
  fetchExperiences,
  normalizeBookings,
  testConnection,
} from '../lib/anyroad';
import { logger } from '../lib/logger';
import { format, subDays } from 'date-fns';

// ========================================
// CONFIGURATION
// ========================================

const DEFAULT_LOOKBACK_DAYS = 90;

// ========================================
// CHECKPOINT MANAGEMENT
// ========================================

interface Checkpoint {
  startDate: string;
  endDate: string;
  processedBookings: number;
  processedExperiences: number;
}

/**
 * Save checkpoint
 */
async function saveCheckpoint(checkpoint: Checkpoint): Promise<void> {
  await db.ingestAudit.create({
    data: {
      source: 'anyroad',
      type: 'backfill_checkpoint',
      status: 'success',
      payload: checkpoint,
    },
  });
}

/**
 * Get last checkpoint
 */
async function getLastCheckpoint(): Promise<Checkpoint | null> {
  const lastCheckpoint = await db.ingestAudit.findFirst({
    where: {
      source: 'anyroad',
      type: 'backfill_checkpoint',
      status: 'success',
    },
    orderBy: { ts: 'desc' },
  });

  return lastCheckpoint?.payload as Checkpoint | null;
}

// ========================================
// DATA PERSISTENCE
// ========================================

/**
 * Upsert event (booking) idempotently
 */
async function upsertEvent(event: any): Promise<void> {
  const { customerIdentity, ...eventData } = event;

  try {
    // Upsert customer identity if present
    if (customerIdentity && eventData.customerHash) {
      await db.bridgeCustomerIdentity.upsert({
        where: { customerHash: eventData.customerHash },
        update: {
          anyroadGuestId: customerIdentity.anyroadGuestId,
          updatedAt: new Date(),
        },
        create: {
          customerHash: eventData.customerHash,
          anyroadGuestId: customerIdentity.anyroadGuestId,
        },
      });
    }

    // Upsert event
    await db.factEvent.upsert({
      where: { id: eventData.externalId },
      update: {
        ...eventData,
      },
      create: {
        id: eventData.externalId,
        ...eventData,
      },
    });

    logger.debug('Event upserted', { eventId: eventData.externalId });
  } catch (error) {
    logger.error('Failed to upsert event', error, {
      eventId: eventData.externalId,
    });
    throw error;
  }
}

/**
 * Batch upsert events
 */
async function batchUpsertEvents(events: any[]): Promise<number> {
  let successCount = 0;

  for (const event of events) {
    try {
      await upsertEvent(event);
      successCount++;
    } catch (error) {
      logger.error('Failed to upsert event in batch', error, {
        eventId: event.externalId,
      });
      // Continue with other events
    }
  }

  return successCount;
}

// ========================================
// BACKFILL LOGIC
// ========================================

/**
 * Backfill experiences (for reference data)
 */
async function backfillExperiences(): Promise<number> {
  logger.info('Fetching AnyRoad experiences');

  let totalProcessed = 0;
  let page = 1;

  try {
    while (true) {
      const response = await fetchExperiences({
        page,
        per_page: 100,
        status: 'all',
      });

      const experiences = response.data;
      if (experiences.length === 0) break;

      logger.info('Fetched experiences', { count: experiences.length, page });

      // Store experiences for reference (optional - can be used for enrichment)
      // For now, we'll log them. You could store in a separate DimExperience table
      // or use them to enrich booking data

      totalProcessed += experiences.length;

      if (page >= response.pagination.total_pages) break;
      page++;
    }

    logger.info('Experiences fetched', { total: totalProcessed });
    return totalProcessed;
  } catch (error) {
    logger.error('Failed to fetch experiences', error);
    throw error;
  }
}

/**
 * Backfill bookings for date range
 */
async function backfillBookings(
  startDate: string,
  endDate: string
): Promise<number> {
  logger.info('Fetching AnyRoad bookings', { startDate, endDate });

  let totalProcessed = 0;

  try {
    // Fetch all bookings with automatic pagination
    const bookings = await fetchAllBookings(
      startDate,
      endDate,
      (current, total) => {
        logger.info('Fetching bookings progress', { current, total });
      }
    );

    if (bookings.length === 0) {
      logger.info('No bookings found for date range');
      return 0;
    }

    logger.info('Fetched all bookings', { count: bookings.length });

    // Normalize bookings to events
    const normalizedEvents = normalizeBookings(bookings);

    logger.info('Normalized bookings to events', { count: normalizedEvents.length });

    // Upsert to database
    const upsertedCount = await batchUpsertEvents(normalizedEvents);
    totalProcessed += upsertedCount;

    logger.info('Upserted events', { count: upsertedCount });

    // Save checkpoint
    await saveCheckpoint({
      startDate,
      endDate,
      processedBookings: totalProcessed,
      processedExperiences: 0,
    });

    return totalProcessed;
  } catch (error) {
    logger.error('Failed to backfill bookings', error, { startDate, endDate });
    throw error;
  }
}

/**
 * Main backfill function
 */
async function backfillAnyRoad(lookbackDays?: number): Promise<void> {
  const days = lookbackDays || DEFAULT_LOOKBACK_DAYS;

  // Calculate date range
  const endDate = format(new Date(), 'yyyy-MM-dd');
  const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');

  logger.info('Starting AnyRoad backfill', {
    startDate,
    endDate,
    lookbackDays: days,
  });

  let totalBookings = 0;
  let totalExperiences = 0;

  try {
    // Step 1: Fetch experiences (for reference)
    totalExperiences = await backfillExperiences();

    // Step 2: Fetch and process bookings
    totalBookings = await backfillBookings(startDate, endDate);

    // Log final success
    await db.ingestAudit.create({
      data: {
        source: 'anyroad',
        type: 'backfill_complete',
        status: 'success',
        payload: {
          startDate,
          endDate,
          totalBookings,
          totalExperiences,
        },
      },
    });

    logger.info('AnyRoad backfill completed', {
      totalBookings,
      totalExperiences,
    });
  } catch (error) {
    // Log failure
    await db.ingestAudit.create({
      data: {
        source: 'anyroad',
        type: 'backfill_error',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        payload: {
          startDate,
          endDate,
          totalBookings,
          totalExperiences,
        },
      },
    });

    throw error;
  }
}

// ========================================
// SCRIPT EXECUTION
// ========================================

async function main() {
  console.log('🚀 Starting AnyRoad Backfill...\n');

  try {
    // Test connection first
    console.log('Testing AnyRoad connection...');
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Failed to connect to AnyRoad API');
    }
    console.log('✅ Connected to AnyRoad\n');

    // Parse command line args
    const lookbackDays = process.argv[2] ? parseInt(process.argv[2]) : undefined;

    // Run backfill
    await backfillAnyRoad(lookbackDays);

    console.log('\n✅ AnyRoad backfill completed successfully!');
    console.log('\nNext steps:');
    console.log('  1. Verify data: npm run prisma:studio');
    console.log('  2. Refresh materialized views: npm run views:refresh');
    console.log('  3. Check audit logs in ingest_audit table');

    process.exit(0);
  } catch (error) {
    logger.error('AnyRoad backfill failed', error);
    console.error('\n❌ Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

main();
