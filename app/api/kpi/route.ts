/**
 * KPI API Endpoint
 * 
 * Provides cached KPI data for client-side components.
 * Uses edge runtime for fast global access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDateRangeKpis, getDailyTrend } from '@/lib/kpi';
import { logger } from '@/lib/logger';

// export const runtime = 'edge'; // Temporarily disabled for local dev

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const channel = searchParams.get('channel') || undefined;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required' },
        { status: 400 }
      );
    }

    const [kpis, trend] = await Promise.all([
      getDateRangeKpis(startDate, endDate, channel),
      getDailyTrend(startDate, endDate, channel),
    ]);

    const response = NextResponse.json({
      kpis,
      trend,
      timestamp: new Date().toISOString(),
    });

    // Cache for 5 minutes
    response.headers.set('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

    return response;
  } catch (error) {
    logger.error('KPI API error', error);
    return NextResponse.json(
      { error: 'Failed to fetch KPIs' },
      { status: 500 }
    );
  }
}

