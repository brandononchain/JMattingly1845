/**
 * Shopify Admin GraphQL Client
 * 
 * Handles data fetching from Shopify Admin API with:
 * - Rate limit handling and retries
 * - Cursor-based pagination
 * - Data normalization for dimensional model
 * - PII hashing for privacy
 */

import { logger } from './logger';
import crypto from 'crypto';

// ========================================
// CONFIGURATION
// ========================================

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;
const SHOPIFY_API_VERSION = '2024-01';

const GRAPHQL_ENDPOINT = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

// Rate limit handling
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

// ========================================
// TYPE DEFINITIONS
// ========================================

export interface ShopifyOrder {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  totalPriceSet: { shopMoney: { amount: string } };
  currentSubtotalPriceSet: { shopMoney: { amount: string } };
  totalDiscountsSet: { shopMoney: { amount: string } };
  totalTaxSet: { shopMoney: { amount: string } };
  totalRefundedSet: { shopMoney: { amount: string } };
  customer: {
    id: string;
    email: string | null;
    phone: string | null;
  } | null;
  lineItems: {
    edges: Array<{
      node: {
        id: string;
        name: string;
        sku: string | null;
        quantity: number;
        originalTotalSet: { shopMoney: { amount: string } };
        product: {
          id: string;
          productType: string | null;
        } | null;
      };
    }>;
  };
  transactions: {
    edges: Array<{
      node: {
        kind: string;
        status: string;
        amountSet: { shopMoney: { amount: string } };
        gateway: string;
      };
    }>;
  };
}

export interface NormalizedOrder {
  externalId: string;
  channelId: string;
  locationId: string | null;
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
  lineItems: NormalizedLineItem[];
  customerIdentity?: {
    shopifyCustomerId: string;
    email?: string;
    phone?: string;
  };
}

export interface NormalizedLineItem {
  externalId: string;
  sku: string | null;
  productTitle: string;
  category: string | null;
  qty: number;
  lineTotal: number;
}

export interface PaginationInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

// ========================================
// GRAPHQL QUERIES
// ========================================

const ORDERS_QUERY = `
  query GetOrders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT) {
      edges {
        cursor
        node {
          id
          name
          createdAt
          updatedAt
          totalPriceSet {
            shopMoney {
              amount
            }
          }
          currentSubtotalPriceSet {
            shopMoney {
              amount
            }
          }
          totalDiscountsSet {
            shopMoney {
              amount
            }
          }
          totalTaxSet {
            shopMoney {
              amount
            }
          }
          totalRefundedSet {
            shopMoney {
              amount
            }
          }
          customer {
            id
            email
            phone
          }
          lineItems(first: 100) {
            edges {
              node {
                id
                name
                sku
                quantity
                originalTotalSet {
                  shopMoney {
                    amount
                  }
                }
                product {
                  id
                  productType
                }
              }
            }
          }
          transactions(first: 10) {
            edges {
              node {
                kind
                status
                amountSet {
                  shopMoney {
                    amount
                  }
                }
                gateway
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ========================================
// GRAPHQL CLIENT
// ========================================

/**
 * Execute GraphQL query with rate limit handling
 */
async function executeGraphQL<T = any>(
  query: string,
  variables: Record<string, any> = {},
  retryCount = 0
): Promise<T> {
  try {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    });

    // Check rate limit headers
    const rateLimitRemaining = response.headers.get('X-Shopify-Shop-Api-Call-Limit');
    if (rateLimitRemaining) {
      const [used, total] = rateLimitRemaining.split('/').map(Number);
      if (used >= total * 0.9) {
        logger.warn('Approaching Shopify rate limit', { used, total });
        await sleep(500); // Throttle if approaching limit
      }
    }

    if (response.status === 429) {
      // Rate limited - retry with exponential backoff
      if (retryCount < MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
        logger.warn('Rate limited by Shopify, retrying...', { retryCount, delay });
        await sleep(delay);
        return executeGraphQL<T>(query, variables, retryCount + 1);
      }
      throw new Error('Rate limit exceeded, max retries reached');
    }

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    if (result.errors) {
      logger.error('GraphQL errors', result.errors);
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data as T;
  } catch (error) {
    logger.error('GraphQL request failed', error, { retryCount });
    throw error;
  }
}

/**
 * Sleep helper for rate limiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========================================
// DATA FETCHING
// ========================================

/**
 * Fetch orders with pagination
 */
export async function fetchOrders(
  query: string,
  cursor?: string,
  limit: number = 50
): Promise<{ orders: ShopifyOrder[]; pageInfo: PaginationInfo }> {
  const variables = {
    first: limit,
    after: cursor || null,
    query,
  };

  const data = await executeGraphQL<{
    orders: {
      edges: Array<{ node: ShopifyOrder; cursor: string }>;
      pageInfo: PaginationInfo;
    };
  }>(ORDERS_QUERY, variables);

  return {
    orders: data.orders.edges.map(edge => edge.node),
    pageInfo: data.orders.pageInfo,
  };
}

/**
 * Fetch orders by date range
 */
export async function fetchOrdersByDateRange(
  startDate: string,
  endDate: string,
  cursor?: string
): Promise<{ orders: ShopifyOrder[]; pageInfo: PaginationInfo }> {
  const query = `created_at:>='${startDate}' AND created_at:<='${endDate}'`;
  return fetchOrders(query, cursor);
}

// ========================================
// DATA NORMALIZATION
// ========================================

/**
 * Hash PII for privacy (email or phone)
 */
export function hashPii(value: string | null | undefined): string | null {
  if (!value) return null;
  
  const normalized = value.toLowerCase().trim();
  return crypto
    .createHash('sha256')
    .update(normalized)
    .digest('hex')
    .substring(0, 32); // Use first 32 chars
}

/**
 * Generate composite customer hash from email and phone
 */
export function generateCustomerHash(
  email: string | null,
  phone: string | null
): string | null {
  // Prefer email, fallback to phone
  if (email) return hashPii(email);
  if (phone) return hashPii(phone);
  return null;
}

/**
 * Extract Shopify numeric ID from GID
 */
export function extractShopifyId(gid: string): string {
  // gid://shopify/Order/123456 -> shopify_order_123456
  const parts = gid.split('/');
  const type = parts[3]?.toLowerCase() || 'unknown';
  const id = parts[4] || gid;
  return `shopify_${type}_${id}`;
}

/**
 * Normalize Shopify order to dimensional model
 */
export function normalizeOrder(order: ShopifyOrder): NormalizedOrder {
  const grossTotal = parseFloat(order.totalPriceSet.shopMoney.amount);
  const subtotal = parseFloat(order.currentSubtotalPriceSet.shopMoney.amount);
  const discountTotal = parseFloat(order.totalDiscountsSet.shopMoney.amount);
  const taxTotal = parseFloat(order.totalTaxSet.shopMoney.amount);
  const refundsTotal = parseFloat(order.totalRefundedSet.shopMoney.amount);
  
  // Calculate net total (gross - refunds)
  const netTotal = grossTotal - refundsTotal;

  // Generate customer hash
  const customerHash = order.customer
    ? generateCustomerHash(order.customer.email, order.customer.phone)
    : null;

  // Extract payment methods from transactions
  const tenders = order.transactions.edges
    .filter(e => e.node.kind === 'SALE' && e.node.status === 'SUCCESS')
    .map(e => ({
      gateway: e.node.gateway,
      amount: parseFloat(e.node.amountSet.shopMoney.amount),
    }));

  // Normalize line items
  const lineItems: NormalizedLineItem[] = order.lineItems.edges.map(edge => {
    const item = edge.node;
    return {
      externalId: extractShopifyId(item.id),
      sku: item.sku,
      productTitle: item.name,
      category: item.product?.productType || null,
      qty: item.quantity,
      lineTotal: parseFloat(item.originalTotalSet.shopMoney.amount),
    };
  });

  const normalized: NormalizedOrder = {
    externalId: extractShopifyId(order.id),
    channelId: 'shopify',
    locationId: 'online-shopify',
    createdAt: new Date(order.createdAt),
    updatedAt: new Date(order.updatedAt),
    customerHash,
    grossTotal,
    netTotal,
    taxTotal,
    discountTotal,
    refundsTotal,
    tendersJson: tenders,
    rawJson: order,
    lineItems,
  };

  // Include customer identity for bridge table
  if (order.customer) {
    normalized.customerIdentity = {
      shopifyCustomerId: extractShopifyId(order.customer.id),
      email: order.customer.email || undefined,
      phone: order.customer.phone || undefined,
    };
  }

  return normalized;
}

/**
 * Normalize multiple orders
 */
export function normalizeOrders(orders: ShopifyOrder[]): NormalizedOrder[] {
  return orders.map(normalizeOrder);
}

// ========================================
// WEBHOOK HELPERS
// ========================================

/**
 * Verify Shopify webhook HMAC signature
 */
export function verifyWebhookHmac(body: string, hmacHeader: string): boolean {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    logger.error('SHOPIFY_WEBHOOK_SECRET not configured');
    return false;
  }

  const hash = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader));
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
    logger.error('Failed to parse webhook payload', error);
    throw new Error('Invalid webhook payload');
  }
}

// ========================================
// HEALTH CHECK
// ========================================

/**
 * Test Shopify API connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const SHOP_QUERY = `
      query {
        shop {
          name
          email
        }
      }
    `;
    
    const data = await executeGraphQL<{ shop: { name: string } }>(SHOP_QUERY);
    logger.info('Shopify connection successful', { shop: data.shop.name });
    return true;
  } catch (error) {
    logger.error('Shopify connection failed', error);
    return false;
  }
}
