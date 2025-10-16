/**
 * Cache Configuration
 * 
 * Revalidation times for different data types.
 * Balances freshness vs performance.
 */

// Cache durations (in seconds)
export const CACHE_TIMES = {
  // Very slow-changing data
  DIMENSIONS: 86400, // 24 hours (DimDate, DimChannel, DimLocation)

  // Slow-changing data  
  DAILY_KPIS: 3600, // 1 hour (materialized view data)
  
  // Medium-changing data
  RECENT_KPIS: 300, // 5 minutes (last 7 days)
  
  // Fast-changing data
  REALTIME: 60, // 1 minute (today's data)
  
  // Report data
  REPORTS: 1800, // 30 minutes (historical reports)
};

// Revalidation tags for on-demand revalidation
export const CACHE_TAGS = {
  SHOPIFY_ORDERS: 'shopify-orders',
  SQUARE_ORDERS: 'square-orders',
  ANYROAD_EVENTS: 'anyroad-events',
  KPI_DAILY: 'kpi-daily',
  ALL_DATA: 'all-data',
};

/**
 * Get cache control header for response
 */
export function getCacheControl(maxAge: number, staleWhileRevalidate?: number): string {
  const swr = staleWhileRevalidate || maxAge * 2;
  return `s-maxage=${maxAge}, stale-while-revalidate=${swr}`;
}

