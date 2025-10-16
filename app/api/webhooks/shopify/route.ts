/**
 * Shopify Webhook Handler
 * 
 * Handles real-time webhook events from Shopify:
 * - orders/create
 * - orders/updated
 * - refunds/create
 * 
 * Features:
 * - HMAC signature verification
 * - Idempotent upserts
 * - Audit logging
 * - Error handling
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  verifyWebhookHmac,
  parseWebhookPayload,
  normalizeOrder,
  extractShopifyId,
  generateCustomerHash,
} from '@/lib/shopify';
import { logger } from '@/lib/logger';

// ========================================
// WEBHOOK HANDLER
// ========================================

export async function POST(request: NextRequest) {
  const topic = request.headers.get('x-shopify-topic');
  
  try {
    // Read raw body for HMAC verification
    const body = await request.text();
    const hmacHeader = request.headers.get('x-shopify-hmac-sha256');

    // Verify HMAC signature
    if (!hmacHeader) {
      logger.warn('Shopify webhook missing HMAC header', { topic });
      return NextResponse.json(
        { error: 'Missing HMAC signature' },
        { status: 401 }
      );
    }

    if (!verifyWebhookHmac(body, hmacHeader)) {
      logger.warn('Invalid Shopify webhook HMAC', { topic });
      return NextResponse.json(
        { error: 'Invalid HMAC signature' },
        { status: 401 }
      );
    }

    // Parse payload
    const payload = parseWebhookPayload(body);
    const webhookId = request.headers.get('x-shopify-webhook-id') || 'unknown';

    logger.info('Received Shopify webhook', {
      topic,
      webhookId,
      orderId: payload.id,
    });

    // Log webhook event to audit
    const auditId = await db.ingestAudit.create({
      data: {
        source: 'shopify',
        type: `webhook_${topic}`,
        status: 'processing',
        payload: {
          topic,
          webhookId,
          orderId: payload.id,
        },
      },
    });

    // Handle different webhook topics
    try {
      switch (topic) {
        case 'orders/create':
        case 'orders/updated':
          await handleOrderWebhook(payload);
          break;

        case 'refunds/create':
          await handleRefundWebhook(payload);
          break;

        default:
          logger.warn('Unhandled Shopify webhook topic', { topic });
      }

      // Update audit log to success
      await db.ingestAudit.update({
        where: { id: auditId.id },
        data: {
          status: 'success',
          payload: {
            topic,
            webhookId,
            orderId: payload.id,
            processedAt: new Date().toISOString(),
          },
        },
      });

      logger.info('Shopify webhook processed successfully', { topic, webhookId });

      return NextResponse.json({ received: true });
    } catch (error) {
      // Update audit log to failed
      await db.ingestAudit.update({
        where: { id: auditId.id },
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw error;
    }
  } catch (error) {
    logger.error('Shopify webhook processing failed', error, { topic });
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ========================================
// WEBHOOK PROCESSORS
// ========================================

/**
 * Handle order creation/update webhooks
 */
async function handleOrderWebhook(payload: any): Promise<void> {
  try {
    // Transform webhook payload to GraphQL-like structure
    const shopifyOrder = transformWebhookToOrder(payload);
    
    // Normalize order
    const normalized = normalizeOrder(shopifyOrder);

    // Upsert customer identity
    if (normalized.customerIdentity && normalized.customerHash) {
      await db.bridgeCustomerIdentity.upsert({
        where: { customerHash: normalized.customerHash },
        update: {
          shopifyCustomerId: normalized.customerIdentity.shopifyCustomerId,
          updatedAt: new Date(),
        },
        create: {
          customerHash: normalized.customerHash,
          shopifyCustomerId: normalized.customerIdentity.shopifyCustomerId,
        },
      });
    }

    // Upsert order
    await db.factOrder.upsert({
      where: { id: normalized.externalId },
      update: {
        channelId: normalized.channelId,
        locationId: normalized.locationId,
        createdAt: normalized.createdAt,
        updatedAt: new Date(),
        customerHash: normalized.customerHash,
        grossTotal: normalized.grossTotal,
        netTotal: normalized.netTotal,
        taxTotal: normalized.taxTotal,
        discountTotal: normalized.discountTotal,
        refundsTotal: normalized.refundsTotal,
        tendersJson: normalized.tendersJson,
        rawJson: normalized.rawJson,
      },
      create: {
        id: normalized.externalId,
        channelId: normalized.channelId,
        locationId: normalized.locationId,
        createdAt: normalized.createdAt,
        updatedAt: new Date(),
        customerHash: normalized.customerHash,
        grossTotal: normalized.grossTotal,
        netTotal: normalized.netTotal,
        taxTotal: normalized.taxTotal,
        discountTotal: normalized.discountTotal,
        refundsTotal: normalized.refundsTotal,
        tendersJson: normalized.tendersJson,
        rawJson: normalized.rawJson,
      },
    });

    // Delete existing line items
    await db.factOrderLine.deleteMany({
      where: { orderId: normalized.externalId },
    });

    // Create line items
    if (normalized.lineItems.length > 0) {
      await db.factOrderLine.createMany({
        data: normalized.lineItems.map(item => ({
          id: item.externalId,
          orderId: normalized.externalId,
          sku: item.sku,
          productTitle: item.productTitle,
          category: item.category,
          qty: item.qty,
          lineTotal: item.lineTotal,
        })),
      });
    }

    logger.info('Order webhook processed', {
      orderId: normalized.externalId,
      lineItems: normalized.lineItems.length,
    });
  } catch (error) {
    logger.error('Failed to process order webhook', error);
    throw error;
  }
}

/**
 * Handle refund webhooks
 */
async function handleRefundWebhook(payload: any): Promise<void> {
  try {
    const orderId = `shopify_order_${payload.order_id}`;
    const refundAmount = parseFloat(payload.amount || '0');

    logger.info('Processing refund', { orderId, refundAmount });

    // Find existing order
    const existingOrder = await db.factOrder.findUnique({
      where: { id: orderId },
    });

    if (!existingOrder) {
      logger.warn('Order not found for refund', { orderId });
      return;
    }

    // Update refunds total
    const newRefundsTotal = Number(existingOrder.refundsTotal) + refundAmount;
    const newNetTotal = Number(existingOrder.grossTotal) - newRefundsTotal;

    await db.factOrder.update({
      where: { id: orderId },
      data: {
        refundsTotal: newRefundsTotal,
        netTotal: newNetTotal,
        updatedAt: new Date(),
        rawJson: {
          ...(existingOrder.rawJson as any),
          lastRefund: payload,
          refundedAt: new Date().toISOString(),
        },
      },
    });

    logger.info('Refund processed', {
      orderId,
      refundAmount,
      newRefundsTotal,
      newNetTotal,
    });
  } catch (error) {
    logger.error('Failed to process refund webhook', error);
    throw error;
  }
}

// ========================================
// WEBHOOK PAYLOAD TRANSFORMATION
// ========================================

/**
 * Transform webhook payload to match GraphQL order structure
 */
function transformWebhookToOrder(payload: any): any {
  return {
    id: `gid://shopify/Order/${payload.id}`,
    name: payload.name || payload.order_number,
    createdAt: payload.created_at,
    updatedAt: payload.updated_at,
    totalPriceSet: {
      shopMoney: { amount: payload.total_price || '0' },
    },
    currentSubtotalPriceSet: {
      shopMoney: { amount: payload.subtotal_price || '0' },
    },
    totalDiscountsSet: {
      shopMoney: { amount: payload.total_discounts || '0' },
    },
    totalTaxSet: {
      shopMoney: { amount: payload.total_tax || '0' },
    },
    totalRefundedSet: {
      shopMoney: { amount: calculateTotalRefunded(payload) },
    },
    customer: payload.customer
      ? {
          id: `gid://shopify/Customer/${payload.customer.id}`,
          email: payload.customer.email,
          phone: payload.customer.phone,
        }
      : null,
    lineItems: {
      edges: (payload.line_items || []).map((item: any) => ({
        node: {
          id: `gid://shopify/LineItem/${item.id}`,
          name: item.name,
          sku: item.sku,
          quantity: item.quantity,
          originalTotalSet: {
            shopMoney: { amount: (item.price * item.quantity).toString() },
          },
          product: item.product_id
            ? {
                id: `gid://shopify/Product/${item.product_id}`,
                productType: item.product_type || null,
              }
            : null,
        },
      })),
    },
    transactions: {
      edges: (payload.transactions || []).map((txn: any) => ({
        node: {
          kind: txn.kind?.toUpperCase() || 'SALE',
          status: txn.status?.toUpperCase() || 'SUCCESS',
          amountSet: {
            shopMoney: { amount: txn.amount || '0' },
          },
          gateway: txn.gateway || 'unknown',
        },
      })),
    },
  };
}

/**
 * Calculate total refunded amount from refunds array
 */
function calculateTotalRefunded(payload: any): string {
  if (!payload.refunds || payload.refunds.length === 0) {
    return '0';
  }

  const total = payload.refunds.reduce((sum: number, refund: any) => {
    return sum + parseFloat(refund.total_refund_set?.shop_money?.amount || '0');
  }, 0);

  return total.toString();
}
