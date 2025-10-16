#!/usr/bin/env tsx
/**
 * Data Reconciliation Script
 * 
 * Compares source system data vs data warehouse to identify discrepancies.
 * Features:
 * - Pulls updated_since from each source
 * - Compares totals (count, revenue)
 * - Identifies missing or inconsistent records
 * - Auto-fix option to trigger re-pull
 * - Comprehensive reporting
 */

import { db } from '../lib/db';
import { logger } from '../lib/logger';
import { format, subDays, parseISO } from 'date-fns';
import {
  fetchOrdersByDateRange as fetchShopifyOrders,
} from '../lib/shopify';
import {
  fetchOrders as fetchSquareOrders,
  fetchPayments,
  getLocations,
} from '../lib/square';
import {
  fetchAllBookings,
} from '../lib/anyroad';

// ========================================
// CONFIGURATION
// ========================================

const DEFAULT_DATE_RANGE_DAYS = 7;
const AUTO_FIX = process.argv.includes('--fix');

// ========================================
// TYPE DEFINITIONS
// ========================================

interface ReconciliationResult {
  source: string;
  dateRange: { start: string; end: string };
  sourceCount: number;
  warehouseCount: number;
  sourceRevenue: number;
  warehouseRevenue: number;
  countDiff: number;
  revenueDiff: number;
  status: 'match' | 'mismatch' | 'error';
  details?: any;
}

// ========================================
// SOURCE RECONCILIATION
// ========================================

/**
 * Reconcile Shopify data
 */
async function reconcileShopify(
  startDate: string,
  endDate: string
): Promise<ReconciliationResult> {
  logger.info('Reconciling Shopify', { startDate, endDate });

  try {
    // Fetch from Shopify
    const { orders: shopifyOrders } = await fetchShopifyOrders(startDate, endDate);

    const sourceCount = shopifyOrders.length;
    const sourceRevenue = shopifyOrders.reduce((sum, order) => {
      const total = parseFloat(order.totalPriceSet.shopMoney.amount);
      const refunded = parseFloat(order.totalRefundedSet.shopMoney.amount);
      return sum + (total - refunded);
    }, 0);

    // Fetch from warehouse
    const warehouseOrders = await db.factOrder.findMany({
      where: {
        channelId: 'shopify',
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate + 'T23:59:59Z'),
        },
      },
    });

    const warehouseCount = warehouseOrders.length;
    const warehouseRevenue = warehouseOrders.reduce(
      (sum, order) => sum + Number(order.netTotal),
      0
    );

    const countDiff = warehouseCount - sourceCount;
    const revenueDiff = warehouseRevenue - sourceRevenue;

    return {
      source: 'shopify',
      dateRange: { start: startDate, end: endDate },
      sourceCount,
      warehouseCount,
      sourceRevenue,
      warehouseRevenue,
      countDiff,
      revenueDiff,
      status: Math.abs(countDiff) === 0 && Math.abs(revenueDiff) < 1 ? 'match' : 'mismatch',
    };
  } catch (error) {
    logger.error('Shopify reconciliation failed', error);
    return {
      source: 'shopify',
      dateRange: { start: startDate, end: endDate },
      sourceCount: 0,
      warehouseCount: 0,
      sourceRevenue: 0,
      warehouseRevenue: 0,
      countDiff: 0,
      revenueDiff: 0,
      status: 'error',
      details: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Reconcile Square data
 */
async function reconcileSquare(
  startDate: string,
  endDate: string
): Promise<ReconciliationResult> {
  logger.info('Reconciling Square', { startDate, endDate });

  try {
    const locations = await getLocations();
    let sourceCount = 0;
    let sourceRevenue = 0;

    // Fetch from all Square locations
    for (const location of locations) {
      const { orders } = await fetchSquareOrders({
        locationIds: [location.id],
        beginTime: `${startDate}T00:00:00Z`,
        endTime: `${endDate}T23:59:59Z`,
      });

      const { payments } = await fetchPayments({
        locationId: location.id,
        beginTime: `${startDate}T00:00:00Z`,
        endTime: `${endDate}T23:59:59Z`,
      });

      sourceCount += orders.length;

      // Calculate revenue from orders (with refunds from payments)
      const paymentsMap = new Map(
        payments.map((p) => [
          p.orderId,
          {
            paid: Number(p.amountMoney.amount) / 100,
            refunded: p.refundedMoney ? Number(p.refundedMoney.amount) / 100 : 0,
          },
        ])
      );

      for (const order of orders) {
        const gross = Number(order.totalMoney.amount) / 100;
        const paymentData = paymentsMap.get(order.id);
        const net = paymentData ? gross - paymentData.refunded : gross;
        sourceRevenue += net;
      }
    }

    // Fetch from warehouse
    const warehouseOrders = await db.factOrder.findMany({
      where: {
        channelId: 'square',
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate + 'T23:59:59Z'),
        },
      },
    });

    const warehouseCount = warehouseOrders.length;
    const warehouseRevenue = warehouseOrders.reduce(
      (sum, order) => sum + Number(order.netTotal),
      0
    );

    const countDiff = warehouseCount - sourceCount;
    const revenueDiff = warehouseRevenue - sourceRevenue;

    return {
      source: 'square',
      dateRange: { start: startDate, end: endDate },
      sourceCount,
      warehouseCount,
      sourceRevenue,
      warehouseRevenue,
      countDiff,
      revenueDiff,
      status: Math.abs(countDiff) === 0 && Math.abs(revenueDiff) < 1 ? 'match' : 'mismatch',
    };
  } catch (error) {
    logger.error('Square reconciliation failed', error);
    return {
      source: 'square',
      dateRange: { start: startDate, end: endDate },
      sourceCount: 0,
      warehouseCount: 0,
      sourceRevenue: 0,
      warehouseRevenue: 0,
      countDiff: 0,
      revenueDiff: 0,
      status: 'error',
      details: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Reconcile AnyRoad data
 */
async function reconcileAnyRoad(
  startDate: string,
  endDate: string
): Promise<ReconciliationResult> {
  logger.info('Reconciling AnyRoad', { startDate, endDate });

  try {
    // Fetch from AnyRoad
    const bookings = await fetchAllBookings(startDate, endDate);

    const sourceCount = bookings.length;
    const sourceRevenue = bookings.reduce((sum, booking) => {
      return sum + (booking.total_price || 0) + (booking.add_ons_total || 0);
    }, 0);

    // Fetch from warehouse
    const warehouseEvents = await db.factEvent.findMany({
      where: {
        startsAt: {
          gte: new Date(startDate),
          lte: new Date(endDate + 'T23:59:59Z'),
        },
      },
    });

    const warehouseCount = warehouseEvents.length;
    const warehouseRevenue = warehouseEvents.reduce(
      (sum, event) => sum + Number(event.revenue) + Number(event.addOnSales),
      0
    );

    const countDiff = warehouseCount - sourceCount;
    const revenueDiff = warehouseRevenue - sourceRevenue;

    return {
      source: 'anyroad',
      dateRange: { start: startDate, end: endDate },
      sourceCount,
      warehouseCount,
      sourceRevenue,
      warehouseRevenue,
      countDiff,
      revenueDiff,
      status: Math.abs(countDiff) === 0 && Math.abs(revenueDiff) < 1 ? 'match' : 'mismatch',
    };
  } catch (error) {
    logger.error('AnyRoad reconciliation failed', error);
    return {
      source: 'anyroad',
      dateRange: { start: startDate, end: endDate },
      sourceCount: 0,
      warehouseCount: 0,
      sourceRevenue: 0,
      warehouseRevenue: 0,
      countDiff: 0,
      revenueDiff: 0,
      status: 'error',
      details: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ========================================
// DATA CONSISTENCY CHECKS
// ========================================

/**
 * Check for orphaned line items
 */
async function checkOrphanedLineItems(): Promise<number> {
  const orphaned = await db.factOrderLine.count({
    where: {
      orderId: {
        notIn: await db.factOrder.findMany({ select: { id: true } }).then((orders) =>
          orders.map((o) => o.id)
        ),
      },
    },
  });

  if (orphaned > 0) {
    logger.warn('Found orphaned line items', { count: orphaned });
  }

  return orphaned;
}

/**
 * Check for duplicate IDs
 */
async function checkDuplicates(): Promise<{ orders: number; events: number }> {
  const duplicateOrders = await db.$queryRaw<Array<{ id: string; count: number }>>`
    SELECT id, COUNT(*) as count
    FROM fact_order
    GROUP BY id
    HAVING COUNT(*) > 1
  `;

  const duplicateEvents = await db.$queryRaw<Array<{ id: string; count: number }>>`
    SELECT id, COUNT(*) as count
    FROM fact_event
    GROUP BY id
    HAVING COUNT(*) > 1
  `;

  if (duplicateOrders.length > 0 || duplicateEvents.length > 0) {
    logger.error('Found duplicates', {
      orders: duplicateOrders.length,
      events: duplicateEvents.length,
    });
  }

  return {
    orders: duplicateOrders.length,
    events: duplicateEvents.length,
  };
}

// ========================================
// AUTO-FIX
// ========================================

/**
 * Trigger re-pull for sources with mismatches
 */
async function autoFixMismatches(results: ReconciliationResult[]): Promise<void> {
  logger.info('Auto-fix enabled, triggering re-pulls for mismatches');

  for (const result of results) {
    if (result.status === 'mismatch' && Math.abs(result.countDiff) > 0) {
      logger.info('Triggering re-pull', { source: result.source, date: result.dateRange.start });

      try {
        // Call resync API for each mismatched date
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/admin/resync?source=${result.source}&date=${result.dateRange.start}`,
          {
            method: 'POST',
            headers: {
              'x-webhook-secret': process.env.WEBHOOK_SECRET || '',
            },
          }
        );

        if (response.ok) {
          logger.info('Re-pull triggered successfully', { source: result.source });
        } else {
          logger.error('Re-pull failed', { source: result.source, status: response.status });
        }
      } catch (error) {
        logger.error('Failed to trigger re-pull', error, { source: result.source });
      }
    }
  }
}

// ========================================
// REPORT GENERATION
// ========================================

function printReconciliationReport(results: ReconciliationResult[]): void {
  console.log('\n📊 RECONCILIATION REPORT\n');
  console.log('='.repeat(100));
  console.log(
    `${'SOURCE'.padEnd(12)} | ${'DATE RANGE'.padEnd(24)} | ${'SRC COUNT'.padStart(10)} | ${'WH COUNT'.padStart(10)} | ${'DIFF'.padStart(6)} | ${'SRC $'.padStart(12)} | ${'WH $'.padStart(12)} | ${'DIFF $'.padStart(10)} | ${'STATUS'.padEnd(8)}`
  );
  console.log('='.repeat(100));

  for (const result of results) {
    const dateRange = `${result.dateRange.start} to ${result.dateRange.end}`;
    const statusIcon = result.status === 'match' ? '✅' : result.status === 'error' ? '❌' : '⚠️ ';

    console.log(
      `${result.source.padEnd(12)} | ${dateRange.padEnd(24)} | ${result.sourceCount.toString().padStart(10)} | ${result.warehouseCount.toString().padStart(10)} | ${result.countDiff.toString().padStart(6)} | ${result.sourceRevenue.toFixed(2).padStart(12)} | ${result.warehouseRevenue.toFixed(2).padStart(12)} | ${result.revenueDiff.toFixed(2).padStart(10)} | ${statusIcon} ${result.status}`
    );

    if (result.details) {
      console.log(`  Error: ${result.details}`);
    }
  }

  console.log('='.repeat(100));

  // Summary
  const totalMismatches = results.filter((r) => r.status === 'mismatch').length;
  const totalErrors = results.filter((r) => r.status === 'error').length;
  const totalMatches = results.filter((r) => r.status === 'match').length;

  console.log('\nSUMMARY:');
  console.log(`  ✅ Matches: ${totalMatches}`);
  console.log(`  ⚠️  Mismatches: ${totalMismatches}`);
  console.log(`  ❌ Errors: ${totalErrors}`);
  console.log('');
}

// ========================================
// MAIN RECONCILIATION
// ========================================

async function main() {
  console.log('🚀 Starting Data Reconciliation...\n');

  try {
    // Parse command line args
    const daysArg = process.argv.find((arg) => arg.match(/^\d+$/));
    const days = daysArg ? parseInt(daysArg) : DEFAULT_DATE_RANGE_DAYS;

    const endDate = format(new Date(), 'yyyy-MM-dd');
    const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');

    logger.info('Reconciliation parameters', { startDate, endDate, autoFix: AUTO_FIX });

    console.log(`Date Range: ${startDate} to ${endDate} (${days} days)`);
    console.log(`Auto-fix: ${AUTO_FIX ? 'ENABLED' : 'DISABLED'}\n`);

    // Run reconciliation for each source
    const results: ReconciliationResult[] = [];

    console.log('Reconciling Shopify...');
    const shopifyResult = await reconcileShopify(startDate, endDate);
    results.push(shopifyResult);

    console.log('Reconciling Square...');
    const squareResult = await reconcileSquare(startDate, endDate);
    results.push(squareResult);

    console.log('Reconciling AnyRoad...');
    const anyroadResult = await reconcileAnyRoad(startDate, endDate);
    results.push(anyroadResult);

    // Print report
    printReconciliationReport(results);

    // Check data consistency
    console.log('\n🔍 Checking Data Consistency...\n');

    const orphanedCount = await checkOrphanedLineItems();
    console.log(`  Orphaned line items: ${orphanedCount}`);

    const duplicates = await checkDuplicates();
    console.log(`  Duplicate orders: ${duplicates.orders}`);
    console.log(`  Duplicate events: ${duplicates.events}`);

    // Log to audit
    await db.ingestAudit.create({
      data: {
        source: 'system',
        type: 'reconciliation',
        status: results.every((r) => r.status === 'match') ? 'success' : 'warning',
        payload: {
          dateRange: { start: startDate, end: endDate },
          results,
          orphanedLineItems: orphanedCount,
          duplicates,
        },
      },
    });

    // Auto-fix if enabled
    if (AUTO_FIX && results.some((r) => r.status === 'mismatch')) {
      console.log('\n🔧 Auto-fix enabled, triggering re-pulls...\n');
      await autoFixMismatches(results);
    }

    // Exit code based on results
    const hasCriticalIssues =
      results.some((r) => r.status === 'error') ||
      duplicates.orders > 0 ||
      duplicates.events > 0;

    const hasMismatches = results.some((r) => r.status === 'mismatch');

    if (hasCriticalIssues) {
      console.log('\n❌ Reconciliation completed with CRITICAL issues\n');
      process.exit(2);
    } else if (hasMismatches) {
      console.log('\n⚠️  Reconciliation completed with mismatches\n');
      console.log('Run with --fix flag to auto-correct: npm run reconcile -- --fix\n');
      process.exit(1);
    } else {
      console.log('\n✅ Reconciliation completed successfully - All data matches!\n');
      process.exit(0);
    }
  } catch (error) {
    logger.error('Reconciliation failed', error);
    console.error('\n❌ Fatal error:', error);
    process.exit(2);
  }
}

main();

