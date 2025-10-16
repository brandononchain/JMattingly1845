/**
 * Square Webhook Handler
 * 
 * Handles real-time webhook events from Square:
 * - payment.created
 * - payment.updated
 * - order.created
 * - order.updated
 * 
 * Features:
 * - Signature verification
 * - Payment-to-order reconciliation
 * - Idempotent updates
 * - Audit logging
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  verifyWebhookSignature,
  fetchOrderById,
  normalizeOrder,
  reconcilePaymentsToOrders,
  squareClient,
} from '@/lib/square';
import { logger } from '@/lib/logger';
import { hashPii } from '@/lib/shopify';

// ========================================
// WEBHOOK HANDLER
// ========================================

export async function POST(request: NextRequest) {
  let eventType = 'unknown';

  try {
    // Read raw body for signature verification
    const body = await request.text();
    const signature = request.headers.get('x-square-hmacsha256-signature');
    const webhookUrl = process.env.SQUARE_WEBHOOK_URL || process.env.NEXT_PUBLIC_APP_URL + '/api/webhooks/square';

    // Verify signature
    if (!signature) {
      logger.warn('Square webhook missing signature header');
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 401 }
      );
    }

    if (!verifyWebhookSignature(body, signature, webhookUrl)) {
      logger.warn('Invalid Square webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Parse payload
    const event = JSON.parse(body);
    eventType = event.type || 'unknown';
    const eventId = event.event_id || 'unknown';

    logger.info('Received Square webhook', {
      type: eventType,
      eventId,
    });

    // Log webhook event to audit
    const auditLog = await db.ingestAudit.create({
      data: {
        source: 'square',
        type: `webhook_${eventType}`,
        status: 'processing',
        payload: {
          eventType,
          eventId,
          merchantId: event.merchant_id,
        },
      },
    });

    // Handle different event types
    try {
      switch (eventType) {
        case 'payment.created':
        case 'payment.updated':
          await handlePaymentWebhook(event);
          break;

        case 'order.created':
        case 'order.updated':
          await handleOrderWebhook(event);
          break;

        default:
          logger.info('Unhandled Square webhook type', { eventType });
      }

      // Update audit log to success
      await db.ingestAudit.update({
        where: { id: auditLog.id },
        data: {
          status: 'success',
          payload: {
            eventType,
            eventId,
            processedAt: new Date().toISOString(),
          },
        },
      });

      logger.info('Square webhook processed successfully', { eventType, eventId });

      return NextResponse.json({ received: true });
    } catch (error) {
      // Update audit log to failed
      await db.ingestAudit.update({
        where: { id: auditLog.id },
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw error;
    }
  } catch (error) {
    logger.error('Square webhook processing failed', error, { eventType });

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
 * Handle payment webhooks
 */
async function handlePaymentWebhook(event: any): Promise<void> {
  try {
    const payment = event.data?.object?.payment;
    if (!payment) {
      logger.warn('Payment webhook missing payment data');
      return;
    }

    const orderId = payment.order_id;
    if (!orderId) {
      logger.warn('Payment has no associated order', { paymentId: payment.id });
      return;
    }

    const externalOrderId = `square_order_${orderId}`;

    logger.info('Processing payment webhook', {
      paymentId: payment.id,
      orderId: externalOrderId,
      status: payment.status,
    });

    // Check if order exists in our database
    let existingOrder = await db.factOrder.findUnique({
      where: { id: externalOrderId },
    });

    // If order doesn't exist, fetch it from Square
    if (!existingOrder) {
      logger.info('Order not found, fetching from Square', { orderId });
      
      const squareOrder = await fetchOrderById(orderId);
      if (!squareOrder) {
        logger.warn('Order not found in Square', { orderId });
        return;
      }

      // Normalize and create order
      const normalized = normalizeOrder(squareOrder);
      await upsertOrder(normalized);
      
      existingOrder = await db.factOrder.findUnique({
        where: { id: externalOrderId },
      });
    }

    if (!existingOrder) {
      logger.error('Failed to create/fetch order', { orderId: externalOrderId });
      return;
    }

    // Calculate payment totals
    const paymentAmount = Number(payment.amount_money?.amount || 0) / 100;
    const refundedAmount = payment.refunded_money ? Number(payment.refunded_money.amount) / 100 : 0;
    const processingFees = payment.processing_fee?.reduce(
      (sum: number, fee: any) => sum + Number(fee.amount_money?.amount || 0) / 100,
      0
    ) || 0;

    // Update order with payment information
    const currentTenders = (existingOrder.tendersJson as any) || [];
    
    // Check if payment already exists in tenders
    const paymentExists = Array.isArray(currentTenders) && 
      currentTenders.some((t: any) => t.paymentId === payment.id);

    let updatedTenders;
    if (paymentExists) {
      // Update existing payment
      updatedTenders = currentTenders.map((t: any) =>
        t.paymentId === payment.id
          ? {
              paymentId: payment.id,
              status: payment.status,
              sourceType: payment.source_type,
              amount: paymentAmount,
              cardBrand: payment.card_details?.card?.card_brand,
              last4: payment.card_details?.card?.last_4,
              processingFees,
            }
          : t
      );
    } else {
      // Add new payment
      updatedTenders = [
        ...currentTenders,
        {
          paymentId: payment.id,
          status: payment.status,
          sourceType: payment.source_type,
          amount: paymentAmount,
          cardBrand: payment.card_details?.card?.card_brand,
          last4: payment.card_details?.card?.last_4,
          processingFees,
        },
      ];
    }

    // Calculate new refunds total
    const newRefundsTotal = Number(existingOrder.refundsTotal) + refundedAmount;
    const newNetTotal = Number(existingOrder.grossTotal) - newRefundsTotal;

    // Extract customer hash from payment if available
    let customerHash = existingOrder.customerHash;
    if (!customerHash && payment.buyer_email_address) {
      customerHash = hashPii(payment.buyer_email_address);

      // Update customer identity
      await db.bridgeCustomerIdentity.upsert({
        where: { customerHash },
        update: {
          updatedAt: new Date(),
        },
        create: {
          customerHash,
        },
      });
    }

    // Update order
    await db.factOrder.update({
      where: { id: externalOrderId },
      data: {
        customerHash: customerHash || existingOrder.customerHash,
        refundsTotal: newRefundsTotal,
        netTotal: newNetTotal,
        tendersJson: updatedTenders,
        updatedAt: new Date(),
        rawJson: {
          ...(existingOrder.rawJson as any),
          lastPaymentUpdate: payment,
          updatedAt: new Date().toISOString(),
        },
      },
    });

    logger.info('Payment webhook processed', {
      orderId: externalOrderId,
      paymentId: payment.id,
      amount: paymentAmount,
      refunded: refundedAmount,
      newNetTotal,
    });
  } catch (error) {
    logger.error('Failed to process payment webhook', error);
    throw error;
  }
}

/**
 * Handle order webhooks
 */
async function handleOrderWebhook(event: any): Promise<void> {
  try {
    const order = event.data?.object?.order;
    if (!order) {
      logger.warn('Order webhook missing order data');
      return;
    }

    const orderId = order.id;
    const externalOrderId = `square_order_${orderId}`;

    logger.info('Processing order webhook', {
      orderId: externalOrderId,
      state: order.state,
    });

    // Fetch full order details from Square
    const squareOrder = await fetchOrderById(orderId);
    if (!squareOrder) {
      logger.warn('Order not found in Square', { orderId });
      return;
    }

    // Fetch payments for this order
    const { payments } = await squareClient.paymentsApi.listPayments(
      undefined,
      undefined,
      orderId
    );

    // Reconcile payments
    const paymentsMap = reconcilePaymentsToOrders(
      [squareOrder],
      payments || []
    );

    // Normalize order
    const normalized = normalizeOrder(squareOrder, paymentsMap.get(orderId));

    // Upsert customer identity
    if (normalized.customerIdentity && normalized.customerHash) {
      await db.bridgeCustomerIdentity.upsert({
        where: { customerHash: normalized.customerHash },
        update: {
          updatedAt: new Date(),
        },
        create: {
          customerHash: normalized.customerHash,
        },
      });
    }

    // Upsert order
    await db.factOrder.upsert({
      where: { id: normalized.externalId },
      update: {
        channelId: normalized.channelId,
        locationId: normalized.locationId,
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

    // Delete and recreate line items
    await db.factOrderLine.deleteMany({
      where: { orderId: normalized.externalId },
    });

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
