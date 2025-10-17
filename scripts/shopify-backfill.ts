#!/usr/bin/env tsx
/**
 * Shopify Backfill Script
 * 
 * Fetches historical orders from Shopify and populates the data warehouse.
 * Features:
 * - Date window batching
 * - Cursor pagination
 * - Checkpoint persistence
 * - Idempotent upserts
 * - Progress tracking
 */

import { db } from '../lib/db';
import {
  fetchOrdersByDateRange,
  normalizeOrders,
  testConnection,
} from '../lib/shopify';
import { logger } from '../lib/logger';
import { addDays, format, parseISO } from 'date-fns';

// ========================================
// CONFIGURATION
// ========================================

const BATCH_SIZE = 50; // Orders per page
const DATE_WINDOW_DAYS = 7; // Process 7 days at a time
const DEFAULT_LOOKBACK_DAYS = 90; // Default: last 90 days

// ========================================
// CHECKPOINT MANAGEMENT
// ========================================

interface Checkpoint {
  startDate: string;
  endDate: string;
  cursor: string | null;
  processedCount: number;
}

/**
 * Save checkpoint to IngestAudit
 */
async function saveCheckpoint(checkpoint: Checkpoint): Promise<void> {
  await db.ingestAudit.create({
    data: {
      source: 'shopify',
      type: 'backfill_checkpoint',
      status: 'success',
      payload: checkpoint as any,
    },
  });
}

/**
 * Get last checkpoint
 */
async function getLastCheckpoint(): Promise<Checkpoint | null> {
  const lastCheckpoint = await db.ingestAudit.findFirst({
    where: {
      source: 'shopify',
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
 * Upsert order and line items idempotently
 */
async function upsertOrder(order: any): Promise<void> {
  const { lineItems, customerIdentity, ...orderData } = order;

  try {
    // Upsert customer identity if present
    if (customerIdentity && orderData.customerHash) {
      await db.bridgeCustomerIdentity.upsert({
        where: { customerHash: orderData.customerHash },
        update: {
          shopifyCustomerId: customerIdentity.shopifyCustomerId,
          updatedAt: new Date(),
        },
        create: {
          customerHash: orderData.customerHash,
          shopifyCustomerId: customerIdentity.shopifyCustomerId,
        },
      });
    }

    // Upsert order
    await db.factOrder.upsert({
      where: { id: orderData.externalId },
      update: {
        ...orderData,
        updatedAt: new Date(),
      },
      create: {
        id: orderData.externalId,
        ...orderData,
      },
    });

    // Delete existing line items and recreate (simpler than complex upsert logic)
    await db.factOrderLine.deleteMany({
      where: { orderId: orderData.externalId },
    });

    // Insert line items
    if (lineItems && lineItems.length > 0) {
      await db.factOrderLine.createMany({
        data: lineItems.map((item: any) => ({
          id: item.externalId,
          orderId: orderData.externalId,
          sku: item.sku,
          productTitle: item.productTitle,
          category: item.category,
          qty: item.qty,
          lineTotal: item.lineTotal,
        })),
      });
    }
  } catch (error) {
    logger.error('Failed to upsert order', error, {
      orderId: orderData.externalId,
    });
    throw error;
  }
}

/**
 * Batch upsert orders
 */
async function batchUpsertOrders(orders: any[]): Promise<number> {
  let successCount = 0;

  for (const order of orders) {
    try {
      await upsertOrder(order);
      successCount++;
    } catch (error) {
      logger.error('Failed to upsert order in batch', error, {
        orderId: order.externalId,
      });
      // Continue processing other orders
    }
  }

  return successCount;
}

// ========================================
// BACKFILL LOGIC
// ========================================

/**
 * Process a single date window
 */
async function processDateWindow(
  startDate: Date,
  endDate: Date,
  resumeCursor?: string
): Promise<{ processedCount: number; hasMore: boolean }> {
  const startDateStr = format(startDate, 'yyyy-MM-dd');
  const endDateStr = format(endDate, 'yyyy-MM-dd');

  logger.info('Processing date window', { startDate: startDateStr, endDate: endDateStr });

  let cursor = resumeCursor || undefined;
  let totalProcessed = 0;
  let pageCount = 0;

  while (true) {
    pageCount++;
    logger.info('Fetching page', { page: pageCount, cursor });

    // Fetch orders
    const { orders, pageInfo } = await fetchOrdersByDateRange(
      startDateStr,
      endDateStr,
      cursor
    );

    if (orders.length === 0) {
      logger.info('No orders found in this page');
      break;
    }

    logger.info('Fetched orders', { count: orders.length });

    // Normalize orders
    const normalizedOrders = normalizeOrders(orders);

    // Upsert to database
    const upsertedCount = await batchUpsertOrders(normalizedOrders);
    totalProcessed += upsertedCount;

    logger.info('Upserted orders', {
      upserted: upsertedCount,
      total: totalProcessed,
    });

    // Save checkpoint
    await saveCheckpoint({
      startDate: startDateStr,
      endDate: endDateStr,
      cursor: pageInfo.endCursor,
      processedCount: totalProcessed,
    });

    // Check if more pages exist
    if (!pageInfo.hasNextPage) {
      logger.info('No more pages for this window');
      break;
    }

    cursor = pageInfo.endCursor || undefined;

    // Small delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return {
    processedCount: totalProcessed,
    hasMore: false,
  };
}

/**
 * Main backfill function
 */
async function backfillShopify(lookbackDays?: number): Promise<void> {
  const days = lookbackDays || DEFAULT_LOOKBACK_DAYS;

  // Calculate date range
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  logger.info('Starting Shopify backfill', {
    startDate: format(startDate, 'yyyy-MM-dd'),
    endDate: format(endDate, 'yyyy-MM-dd'),
    lookbackDays: days,
  });

  // Check for existing checkpoint
  const checkpoint = await getLastCheckpoint();
  let currentStart = checkpoint ? parseISO(checkpoint.endDate) : startDate;

  let totalProcessed = 0;
  let windowCount = 0;

  // Process in date windows
  while (currentStart < endDate) {
    windowCount++;
    const windowEnd = addDays(currentStart, DATE_WINDOW_DAYS);
    const actualEnd = windowEnd > endDate ? endDate : windowEnd;

    try {
      const { processedCount } = await processDateWindow(
        currentStart,
        actualEnd,
        checkpoint?.cursor || undefined
      );

      totalProcessed += processedCount;

      logger.info('Completed date window', {
        window: windowCount,
        processed: processedCount,
        totalProcessed,
      });
    } catch (error) {
      logger.error('Failed to process date window', error, {
        startDate: format(currentStart, 'yyyy-MM-dd'),
        endDate: format(actualEnd, 'yyyy-MM-dd'),
      });

      // Log failure to audit
      await db.ingestAudit.create({
        data: {
          source: 'shopify',
          type: 'backfill_error',
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          payload: {
            startDate: format(currentStart, 'yyyy-MM-dd'),
            endDate: format(actualEnd, 'yyyy-MM-dd'),
          },
        },
      });

      throw error;
    }

    // Move to next window
    currentStart = addDays(actualEnd, 1);
  }

  // Log final success
  await db.ingestAudit.create({
    data: {
      source: 'shopify',
      type: 'backfill_complete',
      status: 'success',
      payload: {
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(endDate, 'yyyy-MM-dd'),
        totalProcessed,
        windowCount,
      },
    },
  });

  logger.info('Shopify backfill completed', {
    totalProcessed,
    windowCount,
  });
}

// ========================================
// SCRIPT EXECUTION
// ========================================

async function main() {
  console.log('🚀 Starting Shopify Backfill...\n');

  try {
    // Test connection first
    console.log('Testing Shopify connection...');
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Failed to connect to Shopify API');
    }
    console.log('✅ Connected to Shopify\n');

    // Parse command line args
    const lookbackDays = process.argv[2] ? parseInt(process.argv[2]) : undefined;

    // Run backfill
    await backfillShopify(lookbackDays);

    console.log('\n✅ Shopify backfill completed successfully!');
    console.log('\nNext steps:');
    console.log('  1. Verify data: npm run prisma:studio');
    console.log('  2. Refresh materialized views: npm run views:refresh');
    console.log('  3. Check audit logs in ingest_audit table');

    process.exit(0);
  } catch (error) {
    logger.error('Shopify backfill failed', error);
    console.error('\n❌ Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

main();
