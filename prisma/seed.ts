#!/usr/bin/env tsx
/**
 * Database Seed Script
 * 
 * Seeds dimensional data:
 * - DimDate: Last 3 years through +1 year
 * - DimChannel: Standard sales channels
 * - DimLocation: Default locations
 */

import { PrismaClient } from '@prisma/client';
import { addDays, startOfDay, getYear, getQuarter, getMonth, getDay, getWeek, isWeekend } from 'date-fns';

const prisma = new PrismaClient();

async function seedDimDate() {
  console.log('🌱 Seeding DimDate...');
  
  // Calculate date range: 3 years ago through 1 year in future
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 3);
  startDate.setMonth(0, 1); // January 1st
  
  const endDate = new Date();
  endDate.setFullYear(endDate.getFullYear() + 1);
  endDate.setMonth(11, 31); // December 31st
  
  const dates = [];
  let currentDate = startOfDay(startDate);
  
  while (currentDate <= endDate) {
    dates.push({
      date: new Date(currentDate),
      year: getYear(currentDate),
      quarter: getQuarter(currentDate),
      month: getMonth(currentDate) + 1, // getMonth is 0-indexed
      day: getDay(currentDate),
      week: getWeek(currentDate),
      isWeekend: isWeekend(currentDate),
    });
    
    currentDate = addDays(currentDate, 1);
  }
  
  console.log(`  Creating ${dates.length} date records...`);
  
  // Batch insert for better performance
  const batchSize = 100;
  for (let i = 0; i < dates.length; i += batchSize) {
    const batch = dates.slice(i, i + batchSize);
    await prisma.dimDate.createMany({
      data: batch,
      skipDuplicates: true,
    });
  }
  
  console.log(`  ✅ Created ${dates.length} date records`);
}

async function seedDimChannel() {
  console.log('🌱 Seeding DimChannel...');
  
  const channels = [
    { id: 'shopify', name: 'Shopify' },
    { id: 'square', name: 'Square' },
    { id: 'anyroad', name: 'AnyRoad' },
    { id: 'dtc', name: 'Direct to Consumer' },
  ];
  
  for (const channel of channels) {
    await prisma.dimChannel.upsert({
      where: { id: channel.id },
      update: channel,
      create: channel,
    });
  }
  
  console.log(`  ✅ Created ${channels.length} channels`);
}

async function seedDimLocation() {
  console.log('🌱 Seeding DimLocation...');
  
  const locations = [
    { id: 'online-shopify', name: 'Online Store (Shopify)', channel: 'shopify' },
    { id: 'pos-square-main', name: 'Main Retail Location', channel: 'square' },
    { id: 'pos-square-events', name: 'Events & Pop-ups', channel: 'square' },
    { id: 'experiences-anyroad', name: 'Distillery Experiences', channel: 'anyroad' },
    { id: 'dtc-direct', name: 'Direct Sales', channel: 'dtc' },
  ];
  
  for (const location of locations) {
    await prisma.dimLocation.upsert({
      where: { id: location.id },
      update: location,
      create: location,
    });
  }
  
  console.log(`  ✅ Created ${locations.length} locations`);
}

async function seedSampleData() {
  console.log('🌱 Seeding sample data...');
  
  // Create a sample order
  const sampleOrder = await prisma.factOrder.create({
    data: {
      channelId: 'shopify',
      locationId: 'online-shopify',
      createdAt: new Date(),
      updatedAt: new Date(),
      customerHash: 'sample_hash_12345',
      grossTotal: 150.00,
      netTotal: 135.00,
      taxTotal: 12.00,
      discountTotal: 15.00,
      refundsTotal: 0.00,
      tendersJson: {
        method: 'credit_card',
        last4: '4242',
      },
      rawJson: {
        source: 'shopify',
        order_number: 'JM-1001',
        customer_note: 'Sample order',
      },
      lines: {
        create: [
          {
            sku: 'BOURBON-750ML',
            productTitle: 'J. Mattingly 1845 Bourbon - 750ml',
            category: 'Spirits',
            qty: 2,
            lineTotal: 120.00,
          },
          {
            sku: 'GLASSWARE-SET',
            productTitle: 'Whiskey Glass Set',
            category: 'Merchandise',
            qty: 1,
            lineTotal: 30.00,
          },
        ],
      },
    },
  });
  
  console.log(`  ✅ Created sample order: ${sampleOrder.id}`);
  
  // Create a sample customer identity
  await prisma.bridgeCustomerIdentity.create({
    data: {
      customerHash: 'sample_hash_12345',
      shopifyCustomerId: 'gid://shopify/Customer/12345',
      squareCustomerId: 'CUST_123ABC',
      anyroadGuestId: null,
    },
  });
  
  console.log('  ✅ Created sample customer identity');
  
  // Create a sample event
  await prisma.factEvent.create({
    data: {
      eventType: 'distillery_tour',
      startsAt: new Date('2024-11-01T14:00:00Z'),
      endsAt: new Date('2024-11-01T16:00:00Z'),
      attendees: 12,
      revenue: 480.00,
      addOnSales: 120.00,
      rawJson: {
        experience_name: 'Premium Distillery Tour',
        guide: 'John Smith',
      },
    },
  });
  
  console.log('  ✅ Created sample event');
  
  // Create ingest audit records
  await prisma.ingestAudit.create({
    data: {
      source: 'shopify',
      type: 'order',
      status: 'success',
      payload: { orders_synced: 1 },
    },
  });
  
  console.log('  ✅ Created sample audit log');
}

async function main() {
  console.log('🚀 Starting database seed...\n');
  
  try {
    // Seed dimension tables
    await seedDimDate();
    await seedDimChannel();
    await seedDimLocation();
    
    // Seed sample data
    await seedSampleData();
    
    console.log('\n✅ Database seeded successfully!');
    console.log('\nSummary:');
    
    const dateCount = await prisma.dimDate.count();
    const channelCount = await prisma.dimChannel.count();
    const locationCount = await prisma.dimLocation.count();
    const orderCount = await prisma.factOrder.count();
    const eventCount = await prisma.factEvent.count();
    
    console.log(`  📅 Dates: ${dateCount}`);
    console.log(`  📺 Channels: ${channelCount}`);
    console.log(`  📍 Locations: ${locationCount}`);
    console.log(`  🛒 Orders: ${orderCount}`);
    console.log(`  🎫 Events: ${eventCount}`);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

