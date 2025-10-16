#!/usr/bin/env tsx
/**
 * Refresh Materialized Views Script
 * 
 * Refreshes all materialized views to update with latest data.
 * Can be called manually or scheduled via cron.
 */

import { refreshDailyMaterializedViews } from '../lib/kpi';
import { logger } from '../lib/logger';

async function main() {
  console.log('🔄 Refreshing Materialized Views...\n');
  
  try {
    await refreshDailyMaterializedViews();
    
    console.log('\n✅ All materialized views refreshed successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('Failed to refresh materialized views', error);
    console.error('\n❌ Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

main();

