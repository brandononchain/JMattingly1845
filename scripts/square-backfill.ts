#!/usr/bin/env tsx
/**
 * Square Backfill Script
 * 
 * Fetches historical orders and payments from Square and populates the data warehouse.
 * Features:
 * - Location-based fetching
 * - Date range filtering
 * - Payment-to-order reconciliation
 * - Checkpoint persistence
 * - Idempotent upserts
 */

import { db } from '../lib/db';
import {
  fetchOrders,
  fetchPayments,
  reconcilePaymentsToOrders,
  normalizeOrders,
  testConnection,
  getLocations,
} from '../lib/square';
import { logger } from '../lib/logger';
import { format, subDays } from 'date-fns';

// ========================================
// CONFIGURATION
// ========================================

const BATCH_SIZE = 100; // Orders per page
const DEFAULT_LOOKBACK_DAYS = 90;

// ========================================
// CHECKPOINT MANAGEMENT
// ========================================

interface Checkpoint {
  locationId: string;
  startDate: string;
  endDate: string;
  ordersCursor: string | null;
  paymentsCursor: string | null;
  processedOrders: number;
  processedPayments: number;
}

/**
 * Save checkpoint
 */
async function saveCheckpoint(checkpoint: Checkpoint): Promise<void> {
  await db.ingestAudit.create({
    data: {
      source: 'square',
      type: 'backfill_checkpoint',
      status: 'success',
      payload: checkpoint,
    },
  });
}

/**
 * Get last checkpoint for location
 */
async function getLastCheckpoint(locationId: string): Promise<Checkpoint | null> {
  const lastCheckpoint = await db.ingestAudit.findFirst({
    where: {
      source: 'square',
      type: 'backfill_checkpoint',
      status: 'success',
      payload: {
        path: ['locationId'],
        equals: locationId,
      },
    },
    orderBy: { ts: 'desc' },
  });

  return lastCheckpoint?.payload as Checkpoint | null;
}

// ========================================
// DATA PERSISTENCE
// ========================================

/**
 * Upsert order with line items idempotently
 */
async function upsertOrder(order: any): Promise<void> {
  const { lineItems, customerIdentity, ...orderData } = order;

  try {
    // Upsert customer identity if present
    if (customerIdentity && orderData.customerHash) {
      await db.bridgeCustomerIdentity.upsert({
        where: { customerHash: orderData.customerHash },
        update: {
          squareCustomerId: customerIdentity.squareCustomerId,
          updatedAt: new Date(),
        },
        create: {
          customerHash: orderData.customerHash,
          squareCustomerId: customerIdentity.squareCustomerId,
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

    // Delete existing line items and recreate
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

    logger.debug('Order upserted', { orderId: orderData.externalId });
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
      // Continue with other orders
    }
  }

  return successCount;
}

// ========================================
// BACKFILL LOGIC
// ========================================

/**
 * Process orders and payments for a location and date range
 */
async function processLocationDateRange(
  locationId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  logger.info('Processing location date range', { locationId, startDate, endDate });

  let totalProcessed = 0;
  let ordersCursor: string | undefined;
  let pageCount = 0;

  // Step 1: Fetch all orders for the date range
  const allOrders: any[] = [];

  while (true) {
    pageCount++;
    logger.info('Fetching orders page', { page: pageCount, cursor: ordersCursor });

    const { orders, cursor } = await fetchOrders({
      locationIds: [locationId],
      beginTime: `${startDate}T00:00:00Z`,
      endTime: `${endDate}T23:59:59Z`,
      limit: BATCH_SIZE,
      cursor: ordersCursor,
    });

    if (orders.length === 0) {
      logger.info('No more orders');
      break;
    }

    logger.info('Fetched orders', { count: orders.length });
    allOrders.push(...orders);

    if (!cursor) {
      logger.info('No more pages');
      break;
    }

    ordersCursor = cursor;
  }

  if (allOrders.length === 0) {
    logger.info('No orders found for this period');
    return 0;
  }

  // Step 2: Fetch payments for the same date range
  logger.info('Fetching payments for date range');
  const allPayments: any[] = [];
  let paymentsCursor: string | undefined;

  while (true) {
    const { payments, cursor } = await fetchPayments({
      locationId,
      beginTime: `${startDate}T00:00:00Z`,
      endTime: `${endDate}T23:59:59Z`,
      cursor: paymentsCursor,
    });

    if (payments.length === 0) break;

    logger.info('Fetched payments', { count: payments.length });
    allPayments.push(...payments);

    if (!cursor) break;
    paymentsCursor = cursor;
  }

  // Step 3: Reconcile payments to orders
  logger.info('Reconciling payments to orders', {
    orders: allOrders.length,
    payments: allPayments.length,
  });

  const paymentsMap = reconcilePaymentsToOrders(allOrders, allPayments);

  // Step 4: Normalize and upsert
  logger.info('Normalizing orders');
  const normalizedOrders = normalizeOrders(allOrders, paymentsMap);

  logger.info('Upserting to database');
  const upsertedCount = await batchUpsertOrders(normalizedOrders);
  totalProcessed += upsertedCount;

  logger.info('Completed location date range', {
    locationId,
    processed: upsertedCount,
  });

  // Save checkpoint
  await saveCheckpoint({
    locationId,
    startDate,
    endDate,
    ordersCursor: null,
    paymentsCursor: null,
    processedOrders: allOrders.length,
    processedPayments: allPayments.length,
  });

  return totalProcessed;
}

/**
 * Main backfill function
 */
async function backfillSquare(lookbackDays?: number): Promise<void> {
  const days = lookbackDays || DEFAULT_LOOKBACK_DAYS;

  // Calculate date range
  const endDate = format(new Date(), 'yyyy-MM-dd');
  const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');

  logger.info('Starting Square backfill', {
    startDate,
    endDate,
    lookbackDays: days,
  });

  // Get all locations
  const locations = await getLocations();
  if (locations.length === 0) {
    throw new Error('No Square locations found');
  }

  logger.info('Found Square locations', { count: locations.length });

  let totalProcessed = 0;

  // Process each location
  for (const location of locations) {
    logger.info('Processing location', { id: location.id, name: location.name });

    try {
      // Ensure location exists in dim_location
      await db.dimLocation.upsert({
        where: { id: `square_location_${location.id}` },
        update: {
          name: location.name,
          channel: 'square',
        },
        create: {
          id: `square_location_${location.id}`,
          name: location.name,
          channel: 'square',
        },
      });

      const processed = await processLocationDateRange(
        location.id,
        startDate,
        endDate
      );

      totalProcessed += processed;

      logger.info('Completed location', {
        locationId: location.id,
        processed,
        totalProcessed,
      });
    } catch (error) {
      logger.error('Failed to process location', error, {
        locationId: location.id,
        locationName: location.name,
      });

      // Log error to audit
      await db.ingestAudit.create({
        data: {
          source: 'square',
          type: 'backfill_error',
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          payload: {
            locationId: location.id,
            locationName: location.name,
            startDate,
            endDate,
          },
        },
      });

      // Continue with other locations
    }
  }

  // Log final success
  await db.ingestAudit.create({
    data: {
      source: 'square',
      type: 'backfill_complete',
      status: 'success',
      payload: {
        startDate,
        endDate,
        totalProcessed,
        locationsProcessed: locations.length,
      },
    },
  });

  logger.info('Square backfill completed', {
    totalProcessed,
    locations: locations.length,
  });
}

// ========================================
// SCRIPT EXECUTION
// ========================================

async function main() {
  console.log('🚀 Starting Square Backfill...\n');

  try {
    // Test connection first
    console.log('Testing Square connection...');
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Failed to connect to Square API');
    }
    console.log('✅ Connected to Square\n');

    // Parse command line args
    const lookbackDays = process.argv[2] ? parseInt(process.argv[2]) : undefined;

    // Run backfill
    await backfillSquare(lookbackDays);

    console.log('\n✅ Square backfill completed successfully!');
    console.log('\nNext steps:');
    console.log('  1. Verify data: npm run prisma:studio');
    console.log('  2. Refresh materialized views: npm run views:refresh');
    console.log('  3. Check audit logs in ingest_audit table');

    process.exit(0);
  } catch (error) {
    logger.error('Square backfill failed', error);
    console.error('\n❌ Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

main();
