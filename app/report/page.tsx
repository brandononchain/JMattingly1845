/**
 * Report Page - SSR Rendered Report
 * 
 * Generates a deterministic, print-ready report for a specific period.
 * Can be rendered as HTML or converted to PDF.
 */

import { format, subDays, startOfWeek, startOfMonth, subWeeks, subMonths } from 'date-fns';
import { ReportContent } from '@/lib/report';
import {
  getDateRangeKpis,
  getDailyTrend,
  getTopItems,
  getTopCategories,
  getChannelPerformance,
} from '@/lib/kpi';
import { db } from '@/lib/db';

interface ReportPageProps {
  searchParams: {
    date?: string;
    period?: 'daily' | 'weekly' | 'monthly';
  };
}

/**
 * Calculate date range based on period
 */
function calculateDateRange(period: 'daily' | 'weekly' | 'monthly', referenceDate: Date) {
  let startDate: Date;
  let endDate: Date;

  switch (period) {
    case 'daily':
      startDate = referenceDate;
      endDate = referenceDate;
      break;
    case 'weekly':
      // Week ending on reference date
      endDate = referenceDate;
      startDate = subDays(referenceDate, 6); // 7 days total
      break;
    case 'monthly':
      // Month containing reference date
      endDate = referenceDate;
      startDate = subDays(referenceDate, 29); // 30 days total
      break;
    default:
      startDate = referenceDate;
      endDate = referenceDate;
  }

  return { startDate, endDate };
}

/**
 * Calculate comparison period (previous period)
 */
function calculateComparisonPeriod(
  period: 'daily' | 'weekly' | 'monthly',
  startDate: Date,
  endDate: Date
) {
  const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  return {
    compStartDate: subDays(startDate, daysDiff + 1),
    compEndDate: subDays(startDate, 1),
  };
}

export default async function ReportPage({ searchParams }: ReportPageProps) {
  // Parse parameters
  const period = searchParams.period || 'weekly';
  const referenceDate = searchParams.date ? new Date(searchParams.date) : new Date();

  // Calculate date ranges
  const { startDate, endDate } = calculateDateRange(period, referenceDate);
  const { compStartDate, compEndDate } = calculateComparisonPeriod(period, startDate, endDate);

  const startDateStr = format(startDate, 'yyyy-MM-dd');
  const endDateStr = format(endDate, 'yyyy-MM-dd');
  const compStartStr = format(compStartDate, 'yyyy-MM-dd');
  const compEndStr = format(compEndDate, 'yyyy-MM-dd');

  // Fetch current period data
  const [
    currentKpis,
    previousKpis,
    dailyTrend,
    topItems,
    topCategories,
    channelPerformance,
  ] = await Promise.all([
    getDateRangeKpis(startDateStr, endDateStr),
    getDateRangeKpis(compStartStr, compEndStr),
    getDailyTrend(startDateStr, endDateStr),
    getTopItems(startDateStr, endDateStr, undefined, 10),
    getTopCategories(startDateStr, endDateStr, undefined, 5),
    getChannelPerformance(startDateStr, endDateStr),
  ]);

  // Calculate trends
  const salesTrend = previousKpis.sales > 0
    ? ((currentKpis.sales - previousKpis.sales) / previousKpis.sales) * 100
    : 0;
  const txnsTrend = previousKpis.txns > 0
    ? ((currentKpis.txns - previousKpis.txns) / previousKpis.txns) * 100
    : 0;
  const aovTrend = previousKpis.aov > 0
    ? ((currentKpis.aov - previousKpis.aov) / previousKpis.aov) * 100
    : 0;

  // Prepare report data
  const reportData = {
    metadata: {
      period,
      startDate: startDateStr,
      endDate: endDateStr,
      generatedAt: new Date().toISOString(),
      comparisonStart: compStartStr,
      comparisonEnd: compEndStr,
    },
    summary: {
      sales: currentKpis.sales,
      txns: currentKpis.txns,
      units: currentKpis.units,
      aov: currentKpis.aov,
      itemsPerCustomer: currentKpis.itemsPerCustomer,
      salesTrend,
      txnsTrend,
      aovTrend,
    },
    trends: dailyTrend,
    channels: channelPerformance,
    topProducts: topItems,
    topCategories,
  };

  return <ReportContent data={reportData} />;
}
