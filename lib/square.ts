/**
 * Square API Client
 * 
 * Handles data fetching from Square Orders and Payments APIs with:
 * - Order and payment fetching
 * - Payment-to-order reconciliation
 * - Data normalization for dimensional model
 * - PII hashing for privacy
 */

import { Client, Environment } from 'square';
import { logger } from './logger';
import { hashPii, generateCustomerHash } from './shopify';
import crypto from 'crypto';

// ========================================
// CONFIGURATION
// ========================================

const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN!;
const SQUARE_ENV = process.env.SQUARE_ENV === 'production' 
  ? Environment.Production 
  : Environment.Sandbox;
const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID || '';

// Initialize Square client
export const squareClient = new Client({
  accessToken: SQUARE_ACCESS_TOKEN,
  environment: SQUARE_ENV,
});

// ========================================
// TYPE DEFINITIONS
// ========================================

export interface SquareOrder {
  id: string;
  locationId: string;
  referenceId?: string;
  createdAt: string;
  updatedAt: string;
  state: string;
  totalMoney: { amount: bigint; currency: string };
  totalTaxMoney?: { amount: bigint; currency: string };
  totalDiscountMoney?: { amount: bigint; currency: string };
  totalServiceChargeMoney?: { amount: bigint; currency: string };
  netAmounts?: {
    totalMoney: { amount: bigint; currency: string };
    taxMoney: { amount: bigint; currency: string };
    discountMoney: { amount: bigint; currency: string };
  };
  lineItems?: Array<{
    uid: string;
    name: string;
    quantity: string;
    catalogObjectId?: string;
    variationName?: string;
    basePriceMoney: { amount: bigint; currency: string };
    totalMoney: { amount: bigint; currency: string };
  }>;
}

export interface SquarePayment {
  id: string;
  orderId?: string;
  locationId: string;
  createdAt: string;
  updatedAt: string;
  amountMoney: { amount: bigint; currency: string };
  status: string;
  sourceType?: string;
  cardDetails?: {
    card?: {
      cardBrand?: string;
      last4?: string;
    };
  };
  processingFee?: Array<{
    amountMoney: { amount: bigint; currency: string };
    type: string;
  }>;
  totalMoney?: { amount: bigint; currency: string };
  approvedMoney?: { amount: bigint; currency: string };
  refundedMoney?: { amount: bigint; currency: string };
  buyerEmailAddress?: string;
}

export interface NormalizedSquareOrder {
  externalId: string;
  channelId: string;
  locationId: string;
  createdAt: Date;
  updatedAt: Date;
  customerHash: string | null;
  grossTotal: number;
  netTotal: number;
  taxTotal: number;
  discountTotal: number;
  refundsTotal: number;
  tendersJson: any;
  rawJson: any;
  lineItems: Array<{
    externalId: string;
    sku: string | null;
    productTitle: string;
    category: string | null;
    qty: number;
    lineTotal: number;
  }>;
  customerIdentity?: {
    squareCustomerId?: string;
    email?: string;
  };
}

// ========================================
// DATA FETCHING
// ========================================

/**
 * Fetch orders by location and date range
 */
export async function fetchOrders(params: {
  locationIds?: string[];
  beginTime?: string;
  endTime?: string;
  limit?: number;
  cursor?: string;
}): Promise<{ orders: SquareOrder[]; cursor?: string }> {
  try {
    const { ordersApi } = squareClient;

    const response = await ordersApi.searchOrders({
      locationIds: params.locationIds || [SQUARE_LOCATION_ID],
      cursor: params.cursor,
      limit: params.limit || 100,
      query: {
        filter: {
          dateTimeFilter: params.beginTime || params.endTime ? {
            createdAt: {
              startAt: params.beginTime,
              endAt: params.endTime,
            },
          } : undefined,
        },
        sort: {
          sortField: 'CREATED_AT',
          sortOrder: 'ASC',
        },
      },
    });

    return {
      orders: (response.result.orders || []) as SquareOrder[],
      cursor: response.result.cursor,
    };
  } catch (error) {
    logger.error('Failed to fetch Square orders', error, params);
    throw error;
  }
}

/**
 * Fetch payments by location and date range
 */
export async function fetchPayments(params: {
  locationId?: string;
  beginTime?: string;
  endTime?: string;
  limit?: number;
  cursor?: string;
}): Promise<{ payments: SquarePayment[]; cursor?: string }> {
  try {
    const { paymentsApi } = squareClient;

    const response = await paymentsApi.listPayments(
      params.beginTime,
      params.endTime,
      undefined, // sortOrder
      params.cursor,
      params.locationId || SQUARE_LOCATION_ID,
      undefined, // total
      undefined, // last4
      undefined, // cardBrand
      params.limit
    );

    return {
      payments: (response.result.payments || []) as SquarePayment[],
      cursor: response.result.cursor,
    };
  } catch (error) {
    logger.error('Failed to fetch Square payments', error, params);
    throw error;
  }
}

/**
 * Fetch a specific order by ID
 */
export async function fetchOrderById(orderId: string): Promise<SquareOrder | null> {
  try {
    const { ordersApi } = squareClient;
    const response = await ordersApi.retrieveOrder(orderId);
    return response.result.order as SquareOrder || null;
  } catch (error) {
    logger.error('Failed to fetch Square order by ID', error, { orderId });
    return null;
  }
}

// ========================================
// PAYMENT-ORDER RECONCILIATION
// ========================================

/**
 * Join payments to orders to calculate net amounts and fees
 */
export function reconcilePaymentsToOrders(
  orders: SquareOrder[],
  payments: SquarePayment[]
): Map<string, { payments: SquarePayment[]; totalPaid: number; totalFees: number; totalRefunded: number }> {
  const orderPayments = new Map<string, { 
    payments: SquarePayment[]; 
    totalPaid: number; 
    totalFees: number;
    totalRefunded: number;
  }>();

  // Group payments by order ID
  for (const payment of payments) {
    if (!payment.orderId) continue;

    const existing = orderPayments.get(payment.orderId) || {
      payments: [],
      totalPaid: 0,
      totalFees: 0,
      totalRefunded: 0,
    };

    existing.payments.push(payment);
    
    // Calculate totals
    const amount = Number(payment.amountMoney.amount) / 100; // Convert from cents
    const refunded = payment.refundedMoney ? Number(payment.refundedMoney.amount) / 100 : 0;
    const fees = payment.processingFee?.reduce(
      (sum, fee) => sum + Number(fee.amountMoney.amount) / 100,
      0
    ) || 0;

    if (payment.status === 'COMPLETED') {
      existing.totalPaid += amount;
      existing.totalFees += fees;
      existing.totalRefunded += refunded;
    }

    orderPayments.set(payment.orderId, existing);
  }

  return orderPayments;
}

// ========================================
// DATA NORMALIZATION
// ========================================

/**
 * Normalize Square order to dimensional model
 */
export function normalizeOrder(
  order: SquareOrder,
  paymentData?: { payments: SquarePayment[]; totalPaid: number; totalFees: number; totalRefunded: number }
): NormalizedSquareOrder {
  // Convert Square money (cents) to decimal
  const grossTotal = Number(order.totalMoney.amount) / 100;
  const taxTotal = order.totalTaxMoney ? Number(order.totalTaxMoney.amount) / 100 : 0;
  const discountTotal = order.totalDiscountMoney ? Number(order.totalDiscountMoney.amount) / 100 : 0;
  
  // Use payment data if available, otherwise use order totals
  const refundsTotal = paymentData?.totalRefunded || 0;
  const netTotal = grossTotal - refundsTotal;

  // Extract customer hash from buyer email in payments
  let customerHash: string | null = null;
  let customerEmail: string | undefined;

  if (paymentData?.payments) {
    const paymentWithEmail = paymentData.payments.find(p => p.buyerEmailAddress);
    if (paymentWithEmail?.buyerEmailAddress) {
      customerEmail = paymentWithEmail.buyerEmailAddress;
      customerHash = hashPii(customerEmail);
    }
  }

  // Build tenders JSON from payments
  const tendersJson = paymentData?.payments.map(p => ({
    paymentId: p.id,
    status: p.status,
    sourceType: p.sourceType,
    amount: Number(p.amountMoney.amount) / 100,
    cardBrand: p.cardDetails?.card?.cardBrand,
    last4: p.cardDetails?.card?.last4,
    processingFees: p.processingFee?.map(fee => ({
      type: fee.type,
      amount: Number(fee.amountMoney.amount) / 100,
    })),
  })) || [];

  // Normalize line items
  const lineItems = (order.lineItems || []).map(item => {
    const quantity = parseInt(item.quantity);
    const lineTotal = Number(item.totalMoney.amount) / 100;

    return {
      externalId: `square_lineitem_${item.uid}`,
      sku: item.catalogObjectId || null,
      productTitle: item.variationName ? `${item.name} - ${item.variationName}` : item.name,
      category: null, // Square doesn't provide category in order data
      qty: quantity,
      lineTotal,
    };
  });

  const normalized: NormalizedSquareOrder = {
    externalId: `square_order_${order.id}`,
    channelId: 'square',
    locationId: `square_location_${order.locationId}`,
    createdAt: new Date(order.createdAt),
    updatedAt: new Date(order.updatedAt),
    customerHash,
    grossTotal,
    netTotal,
    taxTotal,
    discountTotal,
    refundsTotal,
    tendersJson,
    rawJson: {
      order,
      payments: paymentData?.payments || [],
      fees: paymentData?.totalFees || 0,
    },
    lineItems,
  };

  // Include customer identity if email available
  if (customerEmail) {
    normalized.customerIdentity = {
      email: customerEmail,
    };
  }

  return normalized;
}

/**
 * Normalize multiple orders with payment data
 */
export function normalizeOrders(
  orders: SquareOrder[],
  paymentsMap: Map<string, any>
): NormalizedSquareOrder[] {
  return orders.map(order => {
    const paymentData = paymentsMap.get(order.id);
    return normalizeOrder(order, paymentData);
  });
}

// ========================================
// WEBHOOK HELPERS
// ========================================

/**
 * Verify Square webhook signature
 */
export function verifyWebhookSignature(
  body: string,
  signature: string,
  webhookUrl: string
): boolean {
  const secret = process.env.SQUARE_WEBHOOK_SECRET;
  if (!secret) {
    logger.error('SQUARE_WEBHOOK_SECRET not configured');
    return false;
  }

  // Square signature format: signature + URL + body
  const payload = webhookUrl + body;
  
  const hash = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}

// ========================================
// HEALTH CHECK
// ========================================

/**
 * Test Square API connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const { locationsApi } = squareClient;
    const response = await locationsApi.listLocations();
    
    const locationCount = response.result.locations?.length || 0;
    logger.info('Square connection successful', { locationCount });
    return true;
  } catch (error) {
    logger.error('Square connection failed', error);
    return false;
  }
}

/**
 * Get available locations
 */
export async function getLocations(): Promise<Array<{ id: string; name: string }>> {
  try {
    const { locationsApi } = squareClient;
    const response = await locationsApi.listLocations();
    
    return (response.result.locations || []).map(loc => ({
      id: loc.id!,
      name: loc.name || 'Unnamed Location',
    }));
  } catch (error) {
    logger.error('Failed to fetch Square locations', error);
    return [];
  }
}
