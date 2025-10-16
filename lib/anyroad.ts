/**
 * AnyRoad API Client
 * 
 * Handles data fetching from AnyRoad Experiences and Bookings APIs with:
 * - REST API client with pagination
 * - Experience and booking fetching
 * - Data normalization for event analytics
 * - Guest PII hashing for privacy
 */

import { logger } from './logger';
import { hashPii, generateCustomerHash } from './shopify';
import crypto from 'crypto';

// ========================================
// CONFIGURATION
// ========================================

const ANYROAD_API_KEY = process.env.ANYROAD_API_KEY!;
const ANYROAD_API_URL = process.env.ANYROAD_API_URL || 'https://api.anyroad.com/v2';

// ========================================
// TYPE DEFINITIONS
// ========================================

export interface AnyRoadExperience {
  id: string;
  name: string;
  description?: string;
  category?: string;
  duration_minutes?: number;
  price?: number;
  currency?: string;
  status?: string;
  created_at: string;
  updated_at: string;
}

export interface AnyRoadBooking {
  id: string;
  experience_id: string;
  experience?: {
    name: string;
    category?: string;
  };
  event_date: string;
  start_time: string;
  end_time?: string;
  status: string;
  guests_count: number;
  total_price: number;
  add_ons_total?: number;
  currency?: string;
  primary_guest?: {
    id: string;
    email?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
  };
  guests?: Array<{
    id: string;
    email?: string;
    phone?: string;
  }>;
  created_at: string;
  updated_at: string;
  metadata?: any;
}

export interface NormalizedEvent {
  externalId: string;
  eventType: string;
  startsAt: Date;
  endsAt: Date | null;
  attendees: number;
  revenue: number;
  addOnSales: number;
  rawJson: any;
  customerHash?: string | null;
  customerIdentity?: {
    anyroadGuestId: string;
    email?: string;
    phone?: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

// ========================================
// API CLIENT
// ========================================

/**
 * Execute AnyRoad API request
 */
async function executeRequest<T = any>(
  endpoint: string,
  params?: Record<string, string | number>
): Promise<T> {
  try {
    const url = new URL(`${ANYROAD_API_URL}${endpoint}`);
    
    // Add query parameters
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value.toString());
      });
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ANYROAD_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AnyRoad API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data as T;
  } catch (error) {
    logger.error('AnyRoad API request failed', error, { endpoint, params });
    throw error;
  }
}

// ========================================
// DATA FETCHING
// ========================================

/**
 * Fetch experiences with pagination
 */
export async function fetchExperiences(params?: {
  page?: number;
  per_page?: number;
  status?: 'active' | 'inactive' | 'all';
}): Promise<PaginatedResponse<AnyRoadExperience>> {
  const queryParams = {
    page: params?.page || 1,
    per_page: params?.per_page || 100,
    status: params?.status || 'active',
  };

  return executeRequest<PaginatedResponse<AnyRoadExperience>>(
    '/experiences',
    queryParams
  );
}

/**
 * Fetch bookings by date range with pagination
 */
export async function fetchBookings(params: {
  start_date: string;
  end_date: string;
  page?: number;
  per_page?: number;
  status?: string;
}): Promise<PaginatedResponse<AnyRoadBooking>> {
  const queryParams: Record<string, string | number> = {
    start_date: params.start_date,
    end_date: params.end_date,
    page: params.page || 1,
    per_page: params.per_page || 100,
  };

  if (params.status) {
    queryParams.status = params.status;
  }

  return executeRequest<PaginatedResponse<AnyRoadBooking>>(
    '/bookings',
    queryParams
  );
}

/**
 * Fetch all bookings for date range (handles pagination automatically)
 */
export async function fetchAllBookings(
  startDate: string,
  endDate: string,
  onProgress?: (current: number, total: number) => void
): Promise<AnyRoadBooking[]> {
  const allBookings: AnyRoadBooking[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    logger.info('Fetching bookings page', { page, totalPages });

    const response = await fetchBookings({
      start_date: startDate,
      end_date: endDate,
      page,
      per_page: 100,
    });

    allBookings.push(...response.data);
    totalPages = response.pagination.total_pages;

    if (onProgress) {
      onProgress(allBookings.length, response.pagination.total);
    }

    page++;

    // Small delay to respect rate limits
    if (page <= totalPages) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return allBookings;
}

// ========================================
// DATA NORMALIZATION
// ========================================

/**
 * Normalize AnyRoad booking to FactEvent
 */
export function normalizeBooking(booking: AnyRoadBooking): NormalizedEvent {
  // Parse datetime
  const eventDate = booking.event_date;
  const startTime = booking.start_time;
  const endTime = booking.end_time;

  // Combine date and time for proper datetime
  const startsAt = new Date(`${eventDate}T${startTime}`);
  const endsAt = endTime ? new Date(`${eventDate}T${endTime}`) : null;

  // Extract revenue and add-ons
  const revenue = booking.total_price || 0;
  const addOnSales = booking.add_ons_total || 0;

  // Generate customer hash from primary guest
  let customerHash: string | null = null;
  let customerIdentity: NormalizedEvent['customerIdentity'] = undefined;

  if (booking.primary_guest) {
    const guest = booking.primary_guest;
    customerHash = generateCustomerHash(guest.email || null, guest.phone || null);

    if (customerHash) {
      customerIdentity = {
        anyroadGuestId: `anyroad_guest_${guest.id}`,
        email: guest.email,
        phone: guest.phone,
      };
    }
  }

  // Determine event type from experience category or name
  const eventType = booking.experience?.category || 
    (booking.experience?.name?.toLowerCase().includes('tour') ? 'tour' : 'experience');

  const normalized: NormalizedEvent = {
    externalId: `anyroad_booking_${booking.id}`,
    eventType,
    startsAt,
    endsAt,
    attendees: booking.guests_count || 0,
    revenue,
    addOnSales,
    rawJson: booking,
    customerHash,
    customerIdentity,
  };

  return normalized;
}

/**
 * Normalize multiple bookings
 */
export function normalizeBookings(bookings: AnyRoadBooking[]): NormalizedEvent[] {
  return bookings.map(normalizeBooking);
}

// ========================================
// WEBHOOK HELPERS
// ========================================

/**
 * Verify AnyRoad webhook HMAC signature
 */
export function verifyWebhookHmac(body: string, signature: string): boolean {
  const secret = process.env.ANYROAD_WEBHOOK_SECRET;
  if (!secret) {
    logger.error('ANYROAD_WEBHOOK_SECRET not configured');
    return false;
  }

  // AnyRoad uses HMAC-SHA256 of the raw body
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}

/**
 * Parse webhook payload
 */
export function parseWebhookPayload(body: string): any {
  try {
    return JSON.parse(body);
  } catch (error) {
    logger.error('Failed to parse AnyRoad webhook payload', error);
    throw new Error('Invalid webhook payload');
  }
}

// ========================================
// HEALTH CHECK
// ========================================

/**
 * Test AnyRoad API connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    // Fetch first page of experiences to test connection
    await fetchExperiences({ page: 1, per_page: 1 });
    logger.info('AnyRoad connection successful');
    return true;
  } catch (error) {
    logger.error('AnyRoad connection failed', error);
    return false;
  }
}
