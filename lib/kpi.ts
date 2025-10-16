/**
 * KPI Analytics Library
 * 
 * Provides materialized view management and query helpers for business analytics.
 * Uses PostgreSQL materialized views for high-performance aggregations.
 */

import { db } from './db';
import { Prisma } from '@prisma/client';
import { logger } from './logger';

// ========================================
// TYPE DEFINITIONS
// ========================================

export interface DailyKpi {
  date: Date;
  channelId: string;
  locationId: string | null;
  sales: number;
  txns: number;
  units: number;
  aov: number;
  itemsPerCustomer: number;
  topItems: TopItem[];
  topMarkets: TopMarket[];
}

export interface TopItem {
  sku: string;
  productTitle: string;
  qty: number;
  revenue: number;
}

export interface TopMarket {
  category: string;
  revenue: number;
  units: number;
}

export interface PeriodAggregates {
  sales: number;
  txns: number;
  units: number;
  aov: number;
  itemsPerCustomer: number;
  growthVsPrevious: number;
}

export interface ChannelPerformance {
  channelId: string;
  channelName: string;
  sales: number;
  txns: number;
  aov: number;
  units: number;
  percentOfTotal: number;
}

// ========================================
// MATERIALIZED VIEW CREATION
// ========================================

/**
 * SQL to create daily KPI materialized view
 * Aggregates orders by date, channel, and location
 */
export const CREATE_MV_KPI_DAILY_SQL = `
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_kpi_daily AS
WITH daily_orders AS (
  SELECT 
    DATE(fo."createdAt") as date,
    fo."channelId",
    fo."locationId",
    fo.id as order_id,
    fo."netTotal",
    fo."customerHash",
    COUNT(DISTINCT fol.id) as line_item_count
  FROM fact_order fo
  LEFT JOIN fact_order_line fol ON fo.id = fol."orderId"
  GROUP BY DATE(fo."createdAt"), fo."channelId", fo."locationId", fo.id, fo."netTotal", fo."customerHash"
),
daily_aggregates AS (
  SELECT
    date,
    "channelId",
    "locationId",
    SUM("netTotal") as sales,
    COUNT(DISTINCT order_id) as txns,
    COUNT(DISTINCT "customerHash") as unique_customers,
    SUM(line_item_count) as total_line_items
  FROM daily_orders
  GROUP BY date, "channelId", "locationId"
),
daily_units AS (
  SELECT
    DATE(fo."createdAt") as date,
    fo."channelId",
    fo."locationId",
    SUM(fol.qty) as units
  FROM fact_order fo
  JOIN fact_order_line fol ON fo.id = fol."orderId"
  GROUP BY DATE(fo."createdAt"), fo."channelId", fo."locationId"
),
top_items_daily AS (
  SELECT
    DATE(fo."createdAt") as date,
    fo."channelId",
    fo."locationId",
    jsonb_agg(
      jsonb_build_object(
        'sku', fol.sku,
        'productTitle', fol."productTitle",
        'qty', item_qty,
        'revenue', item_revenue
      ) ORDER BY item_revenue DESC
    ) FILTER (WHERE row_num <= 10) as top_items
  FROM (
    SELECT
      DATE(fo."createdAt") as date,
      fo."channelId",
      fo."locationId",
      fol.sku,
      fol."productTitle",
      SUM(fol.qty) as item_qty,
      SUM(fol."lineTotal") as item_revenue,
      ROW_NUMBER() OVER (
        PARTITION BY DATE(fo."createdAt"), fo."channelId", fo."locationId" 
        ORDER BY SUM(fol."lineTotal") DESC
      ) as row_num
    FROM fact_order fo
    JOIN fact_order_line fol ON fo.id = fol."orderId"
    WHERE fol.sku IS NOT NULL
    GROUP BY DATE(fo."createdAt"), fo."channelId", fo."locationId", fol.sku, fol."productTitle"
  ) ranked_items
  GROUP BY date, "channelId", "locationId"
),
top_markets_daily AS (
  SELECT
    DATE(fo."createdAt") as date,
    fo."channelId",
    fo."locationId",
    jsonb_agg(
      jsonb_build_object(
        'category', category,
        'revenue', category_revenue,
        'units', category_units
      ) ORDER BY category_revenue DESC
    ) FILTER (WHERE row_num <= 5) as top_markets
  FROM (
    SELECT
      DATE(fo."createdAt") as date,
      fo."channelId",
      fo."locationId",
      COALESCE(fol.category, 'Uncategorized') as category,
      SUM(fol."lineTotal") as category_revenue,
      SUM(fol.qty) as category_units,
      ROW_NUMBER() OVER (
        PARTITION BY DATE(fo."createdAt"), fo."channelId", fo."locationId" 
        ORDER BY SUM(fol."lineTotal") DESC
      ) as row_num
    FROM fact_order fo
    JOIN fact_order_line fol ON fo.id = fol."orderId"
    GROUP BY DATE(fo."createdAt"), fo."channelId", fo."locationId", fol.category
  ) ranked_categories
  GROUP BY date, "channelId", "locationId"
)
SELECT
  da.date,
  da."channelId",
  da."locationId",
  CAST(da.sales AS DECIMAL(14,2)) as sales,
  da.txns,
  COALESCE(du.units, 0) as units,
  CAST(CASE WHEN da.txns > 0 THEN da.sales / da.txns ELSE 0 END AS DECIMAL(14,2)) as aov,
  CAST(CASE WHEN da.unique_customers > 0 THEN da.total_line_items::DECIMAL / da.unique_customers ELSE 0 END AS DECIMAL(14,2)) as items_per_customer,
  COALESCE(ti.top_items, '[]'::jsonb) as top_items,
  COALESCE(tm.top_markets, '[]'::jsonb) as top_markets
FROM daily_aggregates da
LEFT JOIN daily_units du ON da.date = du.date AND da."channelId" = du."channelId" AND (da."locationId" = du."locationId" OR (da."locationId" IS NULL AND du."locationId" IS NULL))
LEFT JOIN top_items_daily ti ON da.date = ti.date AND da."channelId" = ti."channelId" AND (da."locationId" = ti."locationId" OR (da."locationId" IS NULL AND ti."locationId" IS NULL))
LEFT JOIN top_markets_daily tm ON da.date = tm.date AND da."channelId" = tm."channelId" AND (da."locationId" = tm."locationId" OR (da."locationId" IS NULL AND tm."locationId" IS NULL));
`;

/**
 * Create unique index on materialized view for concurrent refresh
 */
export const CREATE_MV_INDEX_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_kpi_daily_unique 
ON mv_kpi_daily (date, "channelId", COALESCE("locationId", ''));
`;

/**
 * Additional indexes for query performance
 */
export const CREATE_MV_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_mv_kpi_daily_date ON mv_kpi_daily (date DESC);
CREATE INDEX IF NOT EXISTS idx_mv_kpi_daily_channel ON mv_kpi_daily ("channelId");
CREATE INDEX IF NOT EXISTS idx_mv_kpi_daily_date_channel ON mv_kpi_daily (date DESC, "channelId");
`;

// ========================================
// MATERIALIZED VIEW MANAGEMENT
// ========================================

/**
 * Create the materialized view and indexes
 */
export async function createDailyMaterializedView(): Promise<void> {
  try {
    logger.info('Creating materialized view mv_kpi_daily...');
    
    // Create the materialized view
    await db.$executeRawUnsafe(CREATE_MV_KPI_DAILY_SQL);
    
    // Create unique index (required for CONCURRENTLY refresh)
    await db.$executeRawUnsafe(CREATE_MV_INDEX_SQL);
    
    // Create additional indexes
    await db.$executeRawUnsafe(CREATE_MV_INDEXES_SQL);
    
    logger.info('Materialized view mv_kpi_daily created successfully');
  } catch (error) {
    logger.error('Failed to create materialized view', error);
    throw error;
  }
}

/**
 * Refresh the materialized view (concurrent refresh for zero downtime)
 */
export async function refreshDailyMaterializedView(): Promise<void> {
  try {
    logger.info('Refreshing materialized view mv_kpi_daily...');
    
    const startTime = Date.now();
    
    // Use CONCURRENTLY to avoid locking the view during refresh
    await db.$executeRawUnsafe('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_kpi_daily');
    
    const duration = Date.now() - startTime;
    logger.info('Materialized view refreshed successfully', { durationMs: duration });
  } catch (error) {
    logger.error('Failed to refresh materialized view', error);
    throw error;
  }
}

/**
 * Drop the materialized view (use with caution)
 */
export async function dropDailyMaterializedView(): Promise<void> {
  try {
    logger.info('Dropping materialized view mv_kpi_daily...');
    await db.$executeRawUnsafe('DROP MATERIALIZED VIEW IF EXISTS mv_kpi_daily CASCADE');
    logger.info('Materialized view dropped successfully');
  } catch (error) {
    logger.error('Failed to drop materialized view', error);
    throw error;
  }
}

// ========================================
// QUERY HELPERS
// ========================================

/**
 * Get today's KPIs
 */
export async function getTodayKpis(channelId?: string): Promise<PeriodAggregates> {
  const today = new Date().toISOString().split('T')[0];
  
  const whereClause = channelId 
    ? Prisma.sql`WHERE date = ${today}::date AND "channelId" = ${channelId}`
    : Prisma.sql`WHERE date = ${today}::date`;
  
  const result = await db.$queryRaw<Array<{
    sales: number;
    txns: number;
    units: number;
    aov: number;
    items_per_customer: number;
  }>>`
    SELECT
      COALESCE(SUM(sales), 0)::DECIMAL as sales,
      COALESCE(SUM(txns), 0)::INTEGER as txns,
      COALESCE(SUM(units), 0)::INTEGER as units,
      COALESCE(AVG(aov), 0)::DECIMAL as aov,
      COALESCE(AVG(items_per_customer), 0)::DECIMAL as items_per_customer
    FROM mv_kpi_daily
    ${whereClause}
  `;
  
  return {
    sales: Number(result[0]?.sales || 0),
    txns: Number(result[0]?.txns || 0),
    units: Number(result[0]?.units || 0),
    aov: Number(result[0]?.aov || 0),
    itemsPerCustomer: Number(result[0]?.items_per_customer || 0),
    growthVsPrevious: 0, // TODO: Calculate vs yesterday
  };
}

/**
 * Get Week-to-Date KPIs
 */
export async function getWtdKpis(channelId?: string): Promise<PeriodAggregates> {
  const whereClause = channelId 
    ? Prisma.sql`WHERE date >= date_trunc('week', CURRENT_DATE) AND "channelId" = ${channelId}`
    : Prisma.sql`WHERE date >= date_trunc('week', CURRENT_DATE)`;
  
  const result = await db.$queryRaw<Array<{
    sales: number;
    txns: number;
    units: number;
    aov: number;
    items_per_customer: number;
  }>>`
    SELECT
      COALESCE(SUM(sales), 0)::DECIMAL as sales,
      COALESCE(SUM(txns), 0)::INTEGER as txns,
      COALESCE(SUM(units), 0)::INTEGER as units,
      COALESCE(AVG(aov), 0)::DECIMAL as aov,
      COALESCE(AVG(items_per_customer), 0)::DECIMAL as items_per_customer
    FROM mv_kpi_daily
    ${whereClause}
  `;
  
  return {
    sales: Number(result[0]?.sales || 0),
    txns: Number(result[0]?.txns || 0),
    units: Number(result[0]?.units || 0),
    aov: Number(result[0]?.aov || 0),
    itemsPerCustomer: Number(result[0]?.items_per_customer || 0),
    growthVsPrevious: 0, // TODO: Calculate vs last week
  };
}

/**
 * Get Month-to-Date KPIs
 */
export async function getMtdKpis(channelId?: string): Promise<PeriodAggregates> {
  const whereClause = channelId 
    ? Prisma.sql`WHERE date >= date_trunc('month', CURRENT_DATE) AND "channelId" = ${channelId}`
    : Prisma.sql`WHERE date >= date_trunc('month', CURRENT_DATE)`;
  
  const result = await db.$queryRaw<Array<{
    sales: number;
    txns: number;
    units: number;
    aov: number;
    items_per_customer: number;
  }>>`
    SELECT
      COALESCE(SUM(sales), 0)::DECIMAL as sales,
      COALESCE(SUM(txns), 0)::INTEGER as txns,
      COALESCE(SUM(units), 0)::INTEGER as units,
      COALESCE(AVG(aov), 0)::DECIMAL as aov,
      COALESCE(AVG(items_per_customer), 0)::DECIMAL as items_per_customer
    FROM mv_kpi_daily
    ${whereClause}
  `;
  
  return {
    sales: Number(result[0]?.sales || 0),
    txns: Number(result[0]?.txns || 0),
    units: Number(result[0]?.units || 0),
    aov: Number(result[0]?.aov || 0),
    itemsPerCustomer: Number(result[0]?.items_per_customer || 0),
    growthVsPrevious: 0, // TODO: Calculate vs last month
  };
}

/**
 * Get Year-to-Date KPIs
 */
export async function getYtdKpis(channelId?: string): Promise<PeriodAggregates> {
  const whereClause = channelId 
    ? Prisma.sql`WHERE date >= date_trunc('year', CURRENT_DATE) AND "channelId" = ${channelId}`
    : Prisma.sql`WHERE date >= date_trunc('year', CURRENT_DATE)`;
  
  const result = await db.$queryRaw<Array<{
    sales: number;
    txns: number;
    units: number;
    aov: number;
    items_per_customer: number;
  }>>`
    SELECT
      COALESCE(SUM(sales), 0)::DECIMAL as sales,
      COALESCE(SUM(txns), 0)::INTEGER as txns,
      COALESCE(SUM(units), 0)::INTEGER as units,
      COALESCE(AVG(aov), 0)::DECIMAL as aov,
      COALESCE(AVG(items_per_customer), 0)::DECIMAL as items_per_customer
    FROM mv_kpi_daily
    ${whereClause}
  `;
  
  return {
    sales: Number(result[0]?.sales || 0),
    txns: Number(result[0]?.txns || 0),
    units: Number(result[0]?.units || 0),
    aov: Number(result[0]?.aov || 0),
    itemsPerCustomer: Number(result[0]?.items_per_customer || 0),
    growthVsPrevious: 0, // TODO: Calculate vs last year
  };
}

/**
 * Get custom date range KPIs
 */
export async function getDateRangeKpis(
  startDate: string,
  endDate: string,
  channelId?: string
): Promise<PeriodAggregates> {
  const whereClause = channelId 
    ? Prisma.sql`WHERE date BETWEEN ${startDate}::date AND ${endDate}::date AND "channelId" = ${channelId}`
    : Prisma.sql`WHERE date BETWEEN ${startDate}::date AND ${endDate}::date`;
  
  const result = await db.$queryRaw<Array<{
    sales: number;
    txns: number;
    units: number;
    aov: number;
    items_per_customer: number;
  }>>`
    SELECT
      COALESCE(SUM(sales), 0)::DECIMAL as sales,
      COALESCE(SUM(txns), 0)::INTEGER as txns,
      COALESCE(SUM(units), 0)::INTEGER as units,
      COALESCE(AVG(aov), 0)::DECIMAL as aov,
      COALESCE(AVG(items_per_customer), 0)::DECIMAL as items_per_customer
    FROM mv_kpi_daily
    ${whereClause}
  `;
  
  return {
    sales: Number(result[0]?.sales || 0),
    txns: Number(result[0]?.txns || 0),
    units: Number(result[0]?.units || 0),
    aov: Number(result[0]?.aov || 0),
    itemsPerCustomer: Number(result[0]?.items_per_customer || 0),
    growthVsPrevious: 0,
  };
}

/**
 * Get channel performance comparison
 */
export async function getChannelPerformance(
  startDate: string,
  endDate: string
): Promise<ChannelPerformance[]> {
  const results = await db.$queryRaw<Array<{
    channelId: string;
    sales: number;
    txns: number;
    units: number;
    aov: number;
  }>>`
    SELECT
      kpi."channelId",
      COALESCE(SUM(kpi.sales), 0)::DECIMAL as sales,
      COALESCE(SUM(kpi.txns), 0)::INTEGER as txns,
      COALESCE(SUM(kpi.units), 0)::INTEGER as units,
      COALESCE(AVG(kpi.aov), 0)::DECIMAL as aov
    FROM mv_kpi_daily kpi
    WHERE kpi.date BETWEEN ${startDate}::date AND ${endDate}::date
    GROUP BY kpi."channelId"
    ORDER BY sales DESC
  `;
  
  const totalSales = results.reduce((sum, r) => sum + Number(r.sales), 0);
  
  // Fetch channel names
  const channels = await db.dimChannel.findMany({
    where: { id: { in: results.map(r => r.channelId) } },
  });
  
  const channelMap = new Map(channels.map(c => [c.id, c.name]));
  
  return results.map(r => ({
    channelId: r.channelId,
    channelName: channelMap.get(r.channelId) || r.channelId,
    sales: Number(r.sales),
    txns: Number(r.txns),
    aov: Number(r.aov),
    units: Number(r.units),
    percentOfTotal: totalSales > 0 ? (Number(r.sales) / totalSales) * 100 : 0,
  }));
}

/**
 * Get top items for a date range and channel
 */
export async function getTopItems(
  startDate: string,
  endDate: string,
  channelId?: string,
  limit: number = 10
): Promise<TopItem[]> {
  const whereClause = channelId 
    ? Prisma.sql`WHERE date BETWEEN ${startDate}::date AND ${endDate}::date AND "channelId" = ${channelId}`
    : Prisma.sql`WHERE date BETWEEN ${startDate}::date AND ${endDate}::date`;
  
  const results = await db.$queryRaw<Array<{
    sku: string;
    productTitle: string;
    qty: number;
    revenue: number;
  }>>`
    WITH items_unnested AS (
      SELECT jsonb_array_elements(top_items) as item
      FROM mv_kpi_daily
      ${whereClause}
    )
    SELECT
      (item->>'sku')::TEXT as sku,
      (item->>'productTitle')::TEXT as "productTitle",
      SUM((item->>'qty')::INTEGER) as qty,
      SUM((item->>'revenue')::DECIMAL) as revenue
    FROM items_unnested
    GROUP BY (item->>'sku'), (item->>'productTitle')
    ORDER BY revenue DESC
    LIMIT ${limit}
  `;
  
  return results.map(r => ({
    sku: r.sku,
    productTitle: r.productTitle,
    qty: Number(r.qty),
    revenue: Number(r.revenue),
  }));
}

/**
 * Get top product categories
 */
export async function getTopCategories(
  startDate: string,
  endDate: string,
  channelId?: string,
  limit: number = 5
): Promise<TopMarket[]> {
  const whereClause = channelId 
    ? Prisma.sql`WHERE date BETWEEN ${startDate}::date AND ${endDate}::date AND "channelId" = ${channelId}`
    : Prisma.sql`WHERE date BETWEEN ${startDate}::date AND ${endDate}::date`;
  
  const results = await db.$queryRaw<Array<{
    category: string;
    revenue: number;
    units: number;
  }>>`
    WITH markets_unnested AS (
      SELECT jsonb_array_elements(top_markets) as market
      FROM mv_kpi_daily
      ${whereClause}
    )
    SELECT
      (market->>'category')::TEXT as category,
      SUM((market->>'revenue')::DECIMAL) as revenue,
      SUM((market->>'units')::INTEGER) as units
    FROM markets_unnested
    GROUP BY (market->>'category')
    ORDER BY revenue DESC
    LIMIT ${limit}
  `;
  
  return results.map(r => ({
    category: r.category,
    revenue: Number(r.revenue),
    units: Number(r.units),
  }));
}

/**
 * Get daily trend data for charts
 */
export async function getDailyTrend(
  startDate: string,
  endDate: string,
  channelId?: string
): Promise<Array<{ date: string; sales: number; txns: number }>> {
  const whereClause = channelId 
    ? Prisma.sql`WHERE date BETWEEN ${startDate}::date AND ${endDate}::date AND "channelId" = ${channelId}`
    : Prisma.sql`WHERE date BETWEEN ${startDate}::date AND ${endDate}::date`;
  
  const results = await db.$queryRaw<Array<{
    date: Date;
    sales: number;
    txns: number;
  }>>`
    SELECT
      date,
      SUM(sales)::DECIMAL as sales,
      SUM(txns)::INTEGER as txns
    FROM mv_kpi_daily
    ${whereClause}
    GROUP BY date
    ORDER BY date ASC
  `;
  
  return results.map(r => ({
    date: r.date.toISOString().split('T')[0],
    sales: Number(r.sales),
    txns: Number(r.txns),
  }));
}

// ========================================
// SCHEDULED JOBS
// ========================================

/**
 * Scheduled job to refresh materialized views daily
 * Should be called from a cron job or scheduled task
 */
export async function refreshDailyMaterializedViews(): Promise<void> {
  try {
    logger.info('Starting scheduled materialized view refresh...');
    
    await refreshDailyMaterializedView();
    
    // Log to audit table
    await db.ingestAudit.create({
      data: {
        source: 'system',
        type: 'mv_refresh',
        status: 'success',
        payload: {
          view: 'mv_kpi_daily',
          timestamp: new Date().toISOString(),
        },
      },
    });
    
    logger.info('Scheduled materialized view refresh completed successfully');
  } catch (error) {
    logger.error('Scheduled materialized view refresh failed', error);
    
    // Log failure to audit table
    await db.ingestAudit.create({
      data: {
        source: 'system',
        type: 'mv_refresh',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        payload: {
          view: 'mv_kpi_daily',
          timestamp: new Date().toISOString(),
        },
      },
    });
    
    throw error;
  }
}
