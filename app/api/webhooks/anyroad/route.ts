/**
 * AnyRoad Webhook Handler
 * 
 * Handles real-time webhook events from AnyRoad:
 * - booking.created
 * - booking.updated
 * - booking.cancelled
 * - booking.completed
 * 
 * Features:
 * - HMAC signature verification
 * - Idempotent updates
 * - Guest PII hashing
 * - Audit logging
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  verifyWebhookHmac,
  parseWebhookPayload,
  normalizeBooking,
} from '@/lib/anyroad';
import { logger } from '@/lib/logger';

// ========================================
// WEBHOOK HANDLER
// ========================================

export async function POST(request: NextRequest) {
  let eventType = 'unknown';

  try {
    // Read raw body for HMAC verification
    const body = await request.text();
    const signature = request.headers.get('x-anyroad-signature');

    // Verify HMAC signature
    if (!signature) {
      logger.warn('AnyRoad webhook missing signature header');
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 401 }
      );
    }

    if (!verifyWebhookHmac(body, signature)) {
      logger.warn('Invalid AnyRoad webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Parse payload
    const payload = parseWebhookPayload(body);
    eventType = payload.event_type || payload.type || 'unknown';
    const webhookId = request.headers.get('x-anyroad-webhook-id') || 'unknown';

    logger.info('Received AnyRoad webhook', {
      eventType,
      webhookId,
      bookingId: payload.data?.id,
    });

    // Log webhook event to audit
    const auditLog = await db.ingestAudit.create({
      data: {
        source: 'anyroad',
        type: `webhook_${eventType}`,
        status: 'processing',
        payload: {
          eventType,
          webhookId,
          bookingId: payload.data?.id,
        },
      },
    });

    // Handle different webhook types
    try {
      const bookingData = payload.data || payload;

      switch (eventType) {
        case 'booking.created':
        case 'booking.updated':
          await handleBookingWebhook(bookingData);
          break;

        case 'booking.cancelled':
          await handleBookingCancellation(bookingData);
          break;

        case 'booking.completed':
          await handleBookingCompletion(bookingData);
          break;

        case 'experience.created':
        case 'experience.updated':
          logger.info('Experience webhook received (informational only)', {
            experienceId: bookingData.id,
          });
          // Could store in DimExperience if needed
          break;

        default:
          logger.warn('Unhandled AnyRoad webhook type', { eventType });
      }

      // Update audit log to success
      await db.ingestAudit.update({
        where: { id: auditLog.id },
        data: {
          status: 'success',
          payload: {
            eventType,
            webhookId,
            bookingId: bookingData.id,
            processedAt: new Date().toISOString(),
          },
        },
      });

      logger.info('AnyRoad webhook processed successfully', { eventType, webhookId });

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
    logger.error('AnyRoad webhook processing failed', error, { eventType });

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
 * Handle booking creation/update webhooks
 */
async function handleBookingWebhook(bookingData: any): Promise<void> {
  try {
    // Normalize booking to event
    const normalized = normalizeBooking(bookingData);

    logger.info('Processing booking webhook', {
      bookingId: normalized.externalId,
      eventType: normalized.eventType,
      attendees: normalized.attendees,
    });

    // Upsert customer identity if present
    if (normalized.customerIdentity && normalized.customerHash) {
      await db.bridgeCustomerIdentity.upsert({
        where: { customerHash: normalized.customerHash },
        update: {
          anyroadGuestId: normalized.customerIdentity.anyroadGuestId,
          updatedAt: new Date(),
        },
        create: {
          customerHash: normalized.customerHash,
          anyroadGuestId: normalized.customerIdentity.anyroadGuestId,
        },
      });

      logger.debug('Customer identity upserted', {
        customerHash: normalized.customerHash,
      });
    }

    // Upsert event
    await db.factEvent.upsert({
      where: { id: normalized.externalId },
      update: {
        eventType: normalized.eventType,
        startsAt: normalized.startsAt,
        endsAt: normalized.endsAt,
        attendees: normalized.attendees,
        revenue: normalized.revenue,
        addOnSales: normalized.addOnSales,
        rawJson: normalized.rawJson,
      },
      create: {
        id: normalized.externalId,
        eventType: normalized.eventType,
        startsAt: normalized.startsAt,
        endsAt: normalized.endsAt,
        attendees: normalized.attendees,
        revenue: normalized.revenue,
        addOnSales: normalized.addOnSales,
        rawJson: normalized.rawJson,
      },
    });

    logger.info('Booking webhook processed', {
      eventId: normalized.externalId,
      revenue: normalized.revenue,
      attendees: normalized.attendees,
    });
  } catch (error) {
    logger.error('Failed to process booking webhook', error);
    throw error;
  }
}

/**
 * Handle booking cancellation
 */
async function handleBookingCancellation(bookingData: any): Promise<void> {
  try {
    const eventId = `anyroad_booking_${bookingData.id}`;

    logger.info('Processing booking cancellation', { eventId });

    // Find existing event
    const existingEvent = await db.factEvent.findUnique({
      where: { id: eventId },
    });

    if (!existingEvent) {
      logger.warn('Event not found for cancellation', { eventId });
      return;
    }

    // Update event to reflect cancellation
    // Set revenue and add-ons to 0, update rawJson with cancellation info
    await db.factEvent.update({
      where: { id: eventId },
      data: {
        revenue: 0,
        addOnSales: 0,
        rawJson: {
          ...(existingEvent.rawJson as any),
          cancelled: true,
          cancelledAt: new Date().toISOString(),
          cancellationReason: bookingData.cancellation_reason,
        },
      },
    });

    logger.info('Booking cancellation processed', { eventId });
  } catch (error) {
    logger.error('Failed to process cancellation webhook', error);
    throw error;
  }
}

/**
 * Handle booking completion
 */
async function handleBookingCompletion(bookingData: any): Promise<void> {
  try {
    const eventId = `anyroad_booking_${bookingData.id}`;

    logger.info('Processing booking completion', { eventId });

    // Find existing event
    const existingEvent = await db.factEvent.findUnique({
      where: { id: eventId },
    });

    if (!existingEvent) {
      logger.warn('Event not found for completion', { eventId });
      // Create it if it doesn't exist
      await handleBookingWebhook(bookingData);
      return;
    }

    // Update with completion data
    await db.factEvent.update({
      where: { id: eventId },
      data: {
        rawJson: {
          ...(existingEvent.rawJson as any),
          completed: true,
          completedAt: new Date().toISOString(),
          actualAttendees: bookingData.actual_attendance || bookingData.guests_count,
        },
      },
    });

    logger.info('Booking completion processed', { eventId });
  } catch (error) {
    logger.error('Failed to process completion webhook', error);
    throw error;
  }
}
