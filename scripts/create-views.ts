#!/usr/bin/env tsx
/**
 * Create Materialized Views Script
 * 
 * Creates and initializes all materialized views for the analytics dashboard.
 * Run this after initial data load or when views need to be recreated.
 */

import { 
  createDailyMaterializedView, 
  refreshDailyMaterializedView,
  dropDailyMaterializedView 
} from '../lib/kpi';
import { logger } from '../lib/logger';

async function main() {
  console.log('🏗️  Creating Materialized Views...\n');
  
  try {
    // Step 1: Drop existing view (optional - use with caution)
    const shouldDrop = process.argv.includes('--drop');
    if (shouldDrop) {
      console.log('⚠️  Dropping existing materialized view...');
      await dropDailyMaterializedView();
      console.log('✅ Dropped successfully\n');
    }
    
    // Step 2: Create materialized view
    console.log('📊 Creating mv_kpi_daily...');
    await createDailyMaterializedView();
    console.log('✅ Materialized view created\n');
    
    // Step 3: Initial refresh
    console.log('🔄 Performing initial refresh...');
    await refreshDailyMaterializedView();
    console.log('✅ Initial refresh complete\n');
    
    console.log('✨ All materialized views created successfully!\n');
    console.log('Next steps:');
    console.log('  1. Verify data: npm run prisma:studio');
    console.log('  2. Query view: SELECT * FROM mv_kpi_daily LIMIT 10;');
    console.log('  3. Set up refresh schedule in vercel.json or cron');
    
    process.exit(0);
  } catch (error) {
    logger.error('Failed to create materialized views', error);
    console.error('\n❌ Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

main();
