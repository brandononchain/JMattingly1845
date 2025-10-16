/**
 * Materialized View Refresh API Endpoint
 * 
 * Refreshes materialized views via HTTP request.
 * Can be triggered by Vercel Cron or manually.
 */

import { NextRequest, NextResponse } from 'next/server';
import { refreshDailyMaterializedViews } from '@/lib/kpi';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    // Verify this is from Vercel Cron or has valid auth
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      logger.warn('Unauthorized refresh-views request');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    logger.info('Materialized view refresh triggered via API');
    
    // Refresh views
    await refreshDailyMaterializedViews();
    
    return NextResponse.json({
      success: true,
      message: 'Materialized views refreshed successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('API refresh-views failed', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // Same as GET for flexibility
  return GET(request);
}

