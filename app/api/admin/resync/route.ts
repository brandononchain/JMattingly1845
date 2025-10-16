/**
 * Admin Resync API Endpoint
 * 
 * Triggers re-synchronization of data for a specific source and date.
 * Useful for fixing data issues or catching up after downtime.
 * 
 * Query params:
 * - source: shopify | square | anyroad | all
 * - date: YYYY-MM-DD (specific day to resync)
 * 
 * Auth: Requires WEBHOOK_SECRET header
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { db } from '@/lib/db';
import { format, parseISO } from 'date-fns';
import {
  fetchOrdersByDateRange as fetchShopifyOrders,
  normalizeOrders as normalizeShopifyOrders,
} from '@/lib/shopify';
import {
  fetchOrders as fetchSquareOrders,
  fetchPayments,
  reconcilePaymentsToOrders,
  normalizeOrders as normalizeSquareOrders,
  getLocations,
} from '@/lib/square';
import {
  fetchAllBookings,
  normalizeBookings,
} from '@/lib/anyroad';
import { refreshDailyMaterializedView } from '@/lib/kpi';

/**
 * Verify admin authentication via shared secret
 */
function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('x-webhook-secret');
  const secret = process.env.WEBHOOK_SECRET;

  if (!secret) {
    logger.error('WEBHOOK_SECRET not configured');
    return false;
  }

  return authHeader === secret;
}

/**
 * Resync Shopify data for a specific date
 */
async function resyncShopify(date: string): Promise<number> {
  logger.info('Resyncing Shopify', { date });

  try {
    const { orders, pageInfo } = await fetchShopifyOrders(date, date);
    const normalized = normalizeShopifyOrders(orders);

    let processedCount = 0;
    for (const order of normalized) {
      const { lineItems, customerIdentity, ...orderData } = order;

      // Upsert customer identity
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
        update: { ...orderData, updatedAt: new Date() },
        create: { id: orderData.externalId, ...orderData },
      });

      // Replace line items
      await db.factOrderLine.deleteMany({
        where: { orderId: orderData.externalId },
      });

      if (lineItems.length > 0) {
        await db.factOrderLine.createMany({
          data: lineItems.map((item) => ({
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

      processedCount++;
    }

    logger.info('Shopify resync complete', { date, count: processedCount });
    return processedCount;
  } catch (error) {
    logger.error('Shopify resync failed', error, { date });
    throw error;
  }
}

/**
 * Resync Square data for a specific date
 */
async function resyncSquare(date: string): Promise<number> {
  logger.info('Resyncing Square', { date });

  try {
    const locations = await getLocations();
    let totalProcessed = 0;

    for (const location of locations) {
      // Ensure location exists
      await db.dimLocation.upsert({
        where: { id: `square_location_${location.id}` },
        update: { name: location.name, channel: 'square' },
        create: {
          id: `square_location_${location.id}`,
          name: location.name,
          channel: 'square',
        },
      });

      // Fetch orders and payments
      const { orders } = await fetchSquareOrders({
        locationIds: [location.id],
        beginTime: `${date}T00:00:00Z`,
        endTime: `${date}T23:59:59Z`,
      });

      const { payments } = await fetchPayments({
        locationId: location.id,
        beginTime: `${date}T00:00:00Z`,
        endTime: `${date}T23:59:59Z`,
      });

      // Reconcile and normalize
      const paymentsMap = reconcilePaymentsToOrders(orders, payments);
      const normalized = normalizeSquareOrders(orders, paymentsMap);

      // Upsert each order
      for (const order of normalized) {
        const { lineItems, customerIdentity, ...orderData } = order;

        // Upsert customer identity
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
          update: { ...orderData, updatedAt: new Date() },
          create: { id: orderData.externalId, ...orderData },
        });

        // Replace line items
        await db.factOrderLine.deleteMany({
          where: { orderId: orderData.externalId },
        });

        if (lineItems.length > 0) {
          await db.factOrderLine.createMany({
            data: lineItems.map((item) => ({
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

        totalProcessed++;
      }
    }

    logger.info('Square resync complete', { date, count: totalProcessed });
    return totalProcessed;
  } catch (error) {
    logger.error('Square resync failed', error, { date });
    throw error;
  }
}

/**
 * Resync AnyRoad data for a specific date
 */
async function resyncAnyRoad(date: string): Promise<number> {
  logger.info('Resyncing AnyRoad', { date });

  try {
    const bookings = await fetchAllBookings(date, date);
    const events = normalizeBookings(bookings);

    let processedCount = 0;
    for (const event of events) {
      const { customerIdentity, ...eventData } = event;

      // Upsert customer identity
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
        update: { ...eventData },
        create: { id: eventData.externalId, ...eventData },
      });

      processedCount++;
    }

    logger.info('AnyRoad resync complete', { date, count: processedCount });
    return processedCount;
  } catch (error) {
    logger.error('AnyRoad resync failed', error, { date });
    throw error;
  }
}

/**
 * GET handler - Check resync status
 */
export async function GET(request: NextRequest) {
  // Verify authentication
  if (!verifyAuth(request)) {
    logger.warn('Unauthorized resync status request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get recent resync operations
    const recentResyncs = await db.ingestAudit.findMany({
      where: {
        type: { in: ['resync_shopify', 'resync_square', 'resync_anyroad'] },
      },
      orderBy: { ts: 'desc' },
      take: 10,
    });

    return NextResponse.json({
      status: 'idle',
      recentOperations: recentResyncs.map((log) => ({
        source: log.source,
        type: log.type,
        status: log.status,
        timestamp: log.ts,
        payload: log.payload,
        error: log.error,
      })),
    });
  } catch (error) {
    logger.error('Failed to fetch resync status', error);
    return NextResponse.json(
      { error: 'Failed to fetch status' },
      { status: 500 }
    );
  }
}

/**
 * POST handler - Trigger resync
 */
export async function POST(request: NextRequest) {
  // Verify authentication
  if (!verifyAuth(request)) {
    logger.warn('Unauthorized resync attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source') || 'all';
    const date = searchParams.get('date') || format(new Date(), 'yyyy-MM-dd');

    // Validate source
    if (!['shopify', 'square', 'anyroad', 'all'].includes(source)) {
      return NextResponse.json(
        { error: 'Invalid source. Must be: shopify, square, anyroad, or all' },
        { status: 400 }
      );
    }

    // Validate date format
    try {
      parseISO(date);
    } catch {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      );
    }

    logger.info('Resync triggered', { source, date });

    const results: Record<string, number> = {};

    // Execute resyncs
    if (source === 'all' || source === 'shopify') {
      try {
        const count = await resyncShopify(date);
        results.shopify = count;

        await db.ingestAudit.create({
          data: {
            source: 'shopify',
            type: 'resync_shopify',
            status: 'success',
            payload: { date, count },
          },
        });
      } catch (error) {
        await db.ingestAudit.create({
          data: {
            source: 'shopify',
            type: 'resync_shopify',
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
            payload: { date },
          },
        });
        results.shopify = 0;
      }
    }

    if (source === 'all' || source === 'square') {
      try {
        const count = await resyncSquare(date);
        results.square = count;

        await db.ingestAudit.create({
          data: {
            source: 'square',
            type: 'resync_square',
            status: 'success',
            payload: { date, count },
          },
        });
      } catch (error) {
        await db.ingestAudit.create({
          data: {
            source: 'square',
            type: 'resync_square',
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
            payload: { date },
          },
        });
        results.square = 0;
      }
    }

    if (source === 'all' || source === 'anyroad') {
      try {
        const count = await resyncAnyRoad(date);
        results.anyroad = count;

        await db.ingestAudit.create({
          data: {
            source: 'anyroad',
            type: 'resync_anyroad',
            status: 'success',
            payload: { date, count },
          },
        });
      } catch (error) {
        await db.ingestAudit.create({
          data: {
            source: 'anyroad',
            type: 'resync_anyroad',
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
            payload: { date },
          },
        });
        results.anyroad = 0;
      }
    }

    // Refresh materialized view
    logger.info('Refreshing materialized view after resync');
    try {
      await refreshDailyMaterializedView();
    } catch (error) {
      logger.error('Failed to refresh MV after resync', error);
    }

    return NextResponse.json({
      success: true,
      message: `Resync completed for ${source}`,
      date,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Resync failed', error);
    return NextResponse.json(
      {
        error: 'Resync failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

