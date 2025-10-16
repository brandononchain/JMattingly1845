# J. Mattingly 1845 Analytics Dashboard

Production-ready multi-channel analytics dashboard integrating Shopify, Square, and AnyRoad for comprehensive business intelligence and automated reporting.

## 🚀 Features

- 📊 **Unified Dashboard** - Real-time KPIs across all sales channels
- 🔄 **Live Data Sync** - Webhook integrations for instant updates
- 📈 **Automated Reports** - PDF reports emailed daily/weekly/monthly
- 🎯 **Channel Analytics** - Compare performance across platforms
- 🔍 **Data Reconciliation** - Built-in integrity checks and auto-fix
- 📅 **Historical Backfill** - Import years of past data
- 🔐 **Privacy First** - PII hashing with SHA-256
- ⚡ **High Performance** - Materialized views for sub-10ms queries

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 14 (App Router, Edge Runtime) |
| **Language** | TypeScript (strict mode) |
| **Database** | PostgreSQL (Neon) + Prisma ORM |
| **UI** | Tailwind CSS + Tremor + Recharts |
| **PDF** | Playwright (server-side) |
| **Email** | Resend |
| **Validation** | Zod |
| **Integrations** | Shopify GraphQL, Square SDK, AnyRoad REST |
| **Hosting** | Vercel (Edge Functions + Cron) |

## 📋 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL database (Neon recommended)
- API credentials for Shopify, Square, and AnyRoad
- Vercel account (for deployment)

### Installation

```bash
# 1. Clone repository
git clone https://github.com/yourusername/jmattingly-dashboard.git
cd jmattingly-dashboard

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env
# Edit .env with your credentials

# 4. Set up database
npm run prisma:generate
npm run prisma:migrate

# 5. Seed dimension tables
npm run seed

# 6. Create materialized views
npm run views:create

# 7. Run development server
npm run dev
```

Visit http://localhost:3000

### Initial Data Load

```bash
# Backfill historical data (90 days)
npm run shopify:backfill
npm run square:backfill
npm run anyroad:backfill

# Refresh materialized views
npm run views:refresh

# Verify data integrity
npm run reconcile
```

## 📁 Project Structure

```
├── app/
│   ├── (dashboard)/page.tsx       # Main dashboard (Edge runtime)
│   ├── report/page.tsx            # SSR report page
│   ├── api/
│   │   ├── webhooks/
│   │   │   ├── shopify/route.ts   # Shopify webhooks
│   │   │   ├── square/route.ts    # Square webhooks
│   │   │   └── anyroad/route.ts   # AnyRoad webhooks
│   │   ├── send-report/route.ts   # Report generation/email
│   │   ├── refresh-views/route.ts # MV refresh (cron)
│   │   ├── kpi/route.ts          # KPI API (Edge)
│   │   └── admin/
│   │       └── resync/route.ts    # Manual resync
│   ├── layout.tsx                 # Root layout
│   └── globals.css                # Global styles
│
├── components/                    # UI components (11 files)
│   ├── KpiCard.tsx               # Metric display
│   ├── ChannelTabs.tsx           # Channel filter
│   ├── DatePicker.tsx            # Date range selector
│   ├── DataHealth.tsx            # Sync status
│   ├── SalesChart.tsx            # Sales trend
│   ├── UnitsChart.tsx            # Units trend
│   ├── TopItemsTable.tsx         # Product rankings
│   ├── TopMarketsTable.tsx       # Category rankings
│   └── LocationFilter.tsx        # Location selector
│
├── lib/                           # Business logic (13 files)
│   ├── db.ts                     # Prisma client
│   ├── kpi.ts                    # KPI queries + MV
│   ├── shopify.ts                # Shopify client
│   ├── square.ts                 # Square client
│   ├── anyroad.ts                # AnyRoad client
│   ├── report.tsx                # Print components
│   ├── render-report.ts          # Playwright PDF
│   ├── email.ts                  # Resend integration
│   ├── auth.ts                   # JWT helpers
│   ├── security.ts               # HMAC + hashing
│   ├── logger.ts                 # Structured logging
│   ├── validation.ts             # Zod schemas
│   └── cache.ts                  # Cache config
│
├── prisma/
│   ├── schema.prisma             # Dimensional model
│   ├── seed.ts                   # Seed script
│   └── migrations/               # SQL migrations
│
├── scripts/                       # CLI tools (6 files)
│   ├── shopify-backfill.ts       # Shopify data import
│   ├── square-backfill.ts        # Square data import
│   ├── anyroad-backfill.ts       # AnyRoad data import
│   ├── reconcile.ts              # Data integrity checks
│   ├── create-views.ts           # Create MVs
│   └── refresh-views.ts          # Refresh MVs
│
├── .env.example                   # Environment template
├── vercel.json                    # Vercel config + cron
├── package.json                   # Dependencies + scripts
└── README.md                      # This file
```

## 🔧 Configuration

### Environment Variables

See `.env.example` for full list. Key variables:

```bash
# Database
DATABASE_URL=postgresql://user:pass@host/db

# Timezone
TIMEZONE=America/Chicago

# Shopify
SHOPIFY_STORE_DOMAIN=yourstore.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxxxx
SHOPIFY_WEBHOOK_SECRET=xxxxx

# Square
SQUARE_ACCESS_TOKEN=xxxxx
SQUARE_ENV=production
SQUARE_LOCATION_ID=xxxxx
SQUARE_WEBHOOK_SECRET=xxxxx
SQUARE_WEBHOOK_URL=xxxxx

# AnyRoad
ANYROAD_API_KEY=xxxxx
ANYROAD_API_URL=https://api.anyroad.com/v2
ANYROAD_WEBHOOK_SECRET=xxxxx

# Resend
RESEND_API_KEY=re_xxxxx
REPORT_RECIPIENTS=owner@jmattingly1845.com,ops@jmattingly1845.com

# Security
WEBHOOK_SECRET=xxxxx
CRON_SECRET=xxxxx
```

### Vercel Cron Jobs

Configured in `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/send-report?period=daily", "schedule": "0 13 * * *" },
    { "path": "/api/send-report?period=weekly", "schedule": "0 13 * * 1" },
    { "path": "/api/send-report?period=monthly", "schedule": "0 13 1 * *" },
    { "path": "/api/refresh-views", "schedule": "0 6 * * *" }
  ]
}
```

- **Daily report**: 7:00 AM CT (13:00 UTC)
- **Weekly report**: 7:00 AM CT Monday (13:00 UTC)
- **Monthly report**: 7:00 AM CT 1st (13:00 UTC)
- **MV refresh**: 12:00 AM CT (06:00 UTC)

## 📊 Database Schema

Dimensional model optimized for analytics:

### Fact Tables
- `FactOrder` - Order transactions (all channels)
- `FactOrderLine` - Line items
- `FactEvent` - AnyRoad events/bookings

### Dimension Tables
- `DimDate` - Date dimension (1,461 days)
- `DimChannel` - Sales channels
- `DimLocation` - Physical/virtual locations

### Bridge Tables
- `BridgeCustomerIdentity` - Cross-channel customer mapping

### Operational
- `IngestAudit` - Audit trail for all ingestions
- `mv_kpi_daily` - Materialized view (pre-aggregated KPIs)

## 🎯 Operations Guide

### 1. Environment Rotation

**When to rotate:**
- Quarterly security review
- After team member departure
- Suspected credential compromise

**Steps:**

```bash
# 1. Generate new credentials
# Shopify: Apps → Your App → API credentials → Regenerate
# Square: Developer Dashboard → Applications → Credentials → Renew
# AnyRoad: Contact support
# Resend: Settings → API Keys → Create

# 2. Update Vercel environment variables
vercel env pull
# Edit .env.production.local
vercel env add SHOPIFY_ADMIN_ACCESS_TOKEN production
vercel env add SQUARE_ACCESS_TOKEN production
vercel env add ANYROAD_API_KEY production
vercel env add RESEND_API_KEY production

# 3. Update webhook secrets
vercel env add SHOPIFY_WEBHOOK_SECRET production
vercel env add SQUARE_WEBHOOK_SECRET production
vercel env add ANYROAD_WEBHOOK_SECRET production

# 4. Update webhooks in each platform
# Shopify: Settings → Notifications → Webhooks → Edit
# Square: Developer Dashboard → Webhooks → Update signature key
# AnyRoad: Settings → Webhooks → Regenerate secret

# 5. Redeploy
vercel --prod

# 6. Test webhooks (see Testing section)

# 7. Rotate internal secrets
vercel env add WEBHOOK_SECRET production
vercel env add CRON_SECRET production

# 8. Document rotation in audit log
echo "$(date): Rotated all credentials" >> .rotation-log
```

### 2. Webhook Replay

**When to replay:**
- Webhook downtime recovery
- Failed processing batch
- Data discrepancy detected

**Steps:**

```bash
# Option A: Via Resync API (recommended)
curl -X POST https://your-domain.vercel.app/api/admin/resync \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "shopify",
    "date": "2024-10-15"
  }'

# Option B: Manual backfill
# Edit scripts/*-backfill.ts to set specific date range
npm run shopify:backfill

# Option C: Via source platform
# Shopify: Settings → Notifications → Webhooks → View recent deliveries → Resend
# Square: Developer Dashboard → Webhooks → Event Log → Replay
# AnyRoad: Contact support

# Verify data after replay
npm run reconcile -- --date 2024-10-15

# Refresh materialized views
npm run views:refresh
```

### 3. Manual Report Sending

**When to send:**
- Ad-hoc request from stakeholder
- Custom date range analysis
- Testing report changes

**Steps:**

```bash
# Option A: Via API (with email)
curl -X POST "https://your-domain.vercel.app/api/send-report?period=weekly" \
  -H "Authorization: Bearer $CRON_SECRET"

# Option B: Via API (download PDF)
curl -X GET "https://your-domain.vercel.app/api/send-report?period=mtd&date=2024-10-15" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -o report.pdf

# Option C: Custom date range
curl -X POST "https://your-domain.vercel.app/api/send-report" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "period": "custom",
    "startDate": "2024-10-01",
    "endDate": "2024-10-15",
    "recipients": ["special@jmattingly1845.com"]
  }'

# Option D: Via Vercel CLI (trigger cron manually)
vercel cron trigger "0 13 * * *"
```

### 4. Adding Report Recipients

**Steps:**

```bash
# 1. Update environment variable
vercel env add REPORT_RECIPIENTS production
# Enter: email1@domain.com,email2@domain.com,email3@domain.com

# 2. Redeploy (picks up new env)
vercel --prod

# 3. Test with manual send
curl -X POST "https://your-domain.vercel.app/api/send-report?period=daily" \
  -H "Authorization: Bearer $CRON_SECRET"

# 4. Verify all recipients received email

# Alternative: One-time send to additional recipient
curl -X POST "https://your-domain.vercel.app/api/send-report" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "period": "weekly",
    "recipients": ["onetime@domain.com"]
  }'
```

### 5. Adding a New Location

**When to add:**
- New retail store opens
- New online marketplace added
- New event venue

**Steps:**

```bash
# 1. Add to database
psql $DATABASE_URL << EOF
INSERT INTO dim_location (id, name, channel)
VALUES ('new-location-id', 'New Store Name', 'square');
EOF

# Or via Prisma Studio
npm run prisma:studio
# Navigate to DimLocation → Add record

# 2. Add location ID to environment (if applicable)
# For Square locations with separate IDs:
vercel env add SQUARE_LOCATION_ID_NEW production

# 3. Backfill data for new location
# Edit scripts/square-backfill.ts
# Add new location ID to LOCATIONS array
npm run square:backfill

# 4. Update webhook config (if location-specific)
# Square: Developer Dashboard → Webhooks → Add location filter

# 5. Refresh materialized views
npm run views:refresh

# 6. Verify in dashboard
# Dashboard → Location filter → Select new location
```

### 6. Adding a New Channel

**When to add:**
- New sales platform (e.g., Amazon, Faire)
- New booking system
- New POS system

**Steps:**

```bash
# 1. Add dimension record
psql $DATABASE_URL << EOF
INSERT INTO dim_channel (id, name)
VALUES ('new-channel', 'New Channel Name');
EOF

# 2. Create client library
# Copy lib/square.ts to lib/newchannel.ts
# Implement:
# - API client with rate limiting
# - Data fetching functions
# - Normalization to FactOrder/FactOrderLine
# - PII hashing (hashPii function)
# - Webhook verification

# 3. Create backfill script
# Copy scripts/square-backfill.ts to scripts/newchannel-backfill.ts
# Implement:
# - Date range iteration
# - Cursor pagination
# - Checkpoint persistence (IngestAudit)
# - Idempotent upserts

# 4. Create webhook handler
# Copy app/api/webhooks/square/route.ts
# Implement:
# - HMAC verification
# - Event handlers
# - Idempotent upserts
# - Audit logging

# 5. Add npm scripts to package.json
{
  "scripts": {
    "newchannel:backfill": "tsx scripts/newchannel-backfill.ts"
  }
}

# 6. Set up environment variables
vercel env add NEWCHANNEL_API_KEY production
vercel env add NEWCHANNEL_WEBHOOK_SECRET production

# 7. Update UI components
# Edit components/ChannelTabs.tsx
# Add new channel to channels array

# 8. Deploy
vercel --prod

# 9. Configure webhooks in platform
# Point to: https://your-domain.vercel.app/api/webhooks/newchannel

# 10. Backfill historical data
npm run newchannel:backfill

# 11. Refresh materialized views
npm run views:refresh
```

## 🚨 Common Failure Modes & Remedies

### 1. Shopify Throttling

**Symptoms:**
- `429 Too Many Requests` errors
- Slow backfill progress
- IngestAudit shows `throttled` status

**Causes:**
- Shopify GraphQL: 50 points/sec, 1000 points burst
- Shopify REST: 2 req/sec standard, 4 req/sec Plus

**Remedies:**

```bash
# A. Adjust throttle settings in lib/shopify.ts
# Reduce requestsPerSecond:
const RATE_LIMIT = {
  requestsPerSecond: 1,  // Down from 2
  maxRetries: 5,
  initialBackoff: 2000,  // Up from 1000
};

# B. Use GraphQL cursor pagination
# Already implemented - verify batches are small (50-100 orders)

# C. Implement backoff observer
# Check lib/shopify.ts → ShopifyGraphQLClient → throttle()

# D. Run backfill during off-peak hours
# Schedule via cron instead of manual

# E. Use Shopify Plus
# Contact Shopify to upgrade for 4 req/sec

# F. Monitor throttle in IngestAudit
psql $DATABASE_URL << EOF
SELECT ts, payload->>'throttle_status'
FROM ingest_audit
WHERE source = 'shopify'
  AND payload->>'throttle_status' IS NOT NULL
ORDER BY ts DESC
LIMIT 20;
EOF
```

**Prevention:**
- Use GraphQL instead of REST (more efficient)
- Batch operations when possible
- Respect `X-Shopify-Shop-Api-Call-Limit` header
- Implement exponential backoff (already done)

### 2. Square Payment Fee Timing

**Symptoms:**
- Net total doesn't match Square dashboard
- Payment `total_money` ≠ `net_amounts.total_money`
- Discrepancy in fee calculations

**Causes:**
- Square fees settled asynchronously (24-48hr delay)
- Payment created before fee calculation
- Partial refunds affect fee allocation
- Chargebacks reverse fees

**Remedies:**

```bash
# A. Re-fetch payments after 48 hours
# Edit scripts/square-backfill.ts
# Add second pass for fee reconciliation:

# Day 1: Fetch orders and payments
npm run square:backfill -- --days 90

# Day 3: Re-fetch payments for fee updates
npm run square:backfill -- --days 90 --fees-only

# B. Trigger resync for specific date
curl -X POST https://your-domain.vercel.app/api/admin/resync \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -d '{"source": "square", "date": "2024-10-13"}'

# C. Manual reconciliation query
psql $DATABASE_URL << EOF
SELECT 
  id,
  "grossTotal",
  "netTotal",
  "grossTotal" - "netTotal" as fees,
  "rawJson"->'payments'->0->'processing_fee' as recorded_fee
FROM fact_order
WHERE "channelId" = 'square'
  AND "createdAt" >= '2024-10-01'
  AND ABS(("grossTotal" - "netTotal") - 
      COALESCE(("rawJson"->'payments'->0->'processing_fee'->>0)::decimal, 0)) > 0.01
ORDER BY "createdAt" DESC;
EOF

# D. Update normalization logic
# Check lib/square.ts → reconcilePaymentsToOrders()
# Ensure handling of:
# - Multiple payments per order
# - Partial refunds
# - Payment status (COMPLETED vs PENDING)
```

**Prevention:**
- Use `payment.updated` webhook (already configured)
- Store `processing_fee` in rawJson (already done)
- Re-sync payments after 48 hours
- Monitor discrepancies via reconcile script

### 3. AnyRoad Event Updates

**Symptoms:**
- Event attendance count changes after fact
- Duplicate FactEvent records
- Missing add-on sales
- Guest list updates not reflected

**Causes:**
- Events updated after booking (capacity, datetime)
- Guests added/removed post-booking
- Add-ons purchased after initial booking
- Cancellations/no-shows

**Remedies:**

```bash
# A. Upsert instead of insert
# Verify lib/anyroad.ts → normalizeBooking()
# Uses idempotent upserts:
await db.factEvent.upsert({
  where: { id: booking.id },
  update: { ...data },
  create: { ...data }
});

# B. Fetch updated bookings
npm run anyroad:backfill -- --updated-since 7d

# C. Handle specific event
curl -X POST https://your-domain.vercel.app/api/admin/resync \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -d '{"source": "anyroad", "eventId": "evt_xxxxx"}'

# D. Query for stale events
psql $DATABASE_URL << EOF
SELECT 
  id,
  "eventType",
  "startsAt",
  attendees,
  "addOnSales",
  "updatedAt"
FROM fact_event
WHERE "updatedAt" < NOW() - INTERVAL '7 days'
  AND "startsAt" > NOW()
ORDER BY "startsAt";
EOF

# E. Verify webhook payload
# Check IngestAudit for event updates
psql $DATABASE_URL << EOF
SELECT payload
FROM ingest_audit
WHERE source = 'anyroad'
  AND type = 'webhook_booking.updated'
ORDER BY ts DESC
LIMIT 5;
EOF
```

**Prevention:**
- Use webhooks for real-time updates (already configured)
- Store full event payload in rawJson (already done)
- Weekly re-sync of upcoming events
- Monitor IngestAudit for update frequency

### 4. Database Connection Pool Exhaustion

**Symptoms:**
- `P2024: Timed out fetching a new connection from the pool`
- Slow query performance
- 500 errors on dashboard

**Remedies:**

```bash
# A. Check connection pool settings
# Neon: Default 100 connections
# Verify DATABASE_URL has ?connection_limit=10

# B. Monitor active connections
psql $DATABASE_URL << EOF
SELECT count(*) as connections
FROM pg_stat_activity
WHERE datname = current_database();
EOF

# C. Restart Prisma client
# Deploy to Vercel (restarts all functions)
vercel --prod

# D. Optimize long-running queries
# Check lib/kpi.ts for missing indexes
EXPLAIN ANALYZE SELECT ...;
```

### 5. Materialized View Stale Data

**Symptoms:**
- Dashboard shows old data
- Recent orders not appearing
- KPIs don't match raw queries

**Remedies:**

```bash
# A. Manual refresh
npm run views:refresh

# Or via SQL:
psql $DATABASE_URL << EOF
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_kpi_daily;
EOF

# B. Check last refresh time
psql $DATABASE_URL << EOF
SELECT MAX(ts) as last_refresh
FROM ingest_audit
WHERE type = 'mv_refresh';
EOF

# C. Verify cron is running
# Vercel Dashboard → Project → Cron Jobs → Check last run

# D. Check for locks
psql $DATABASE_URL << EOF
SELECT * FROM pg_stat_activity
WHERE query LIKE '%mv_kpi_daily%';
EOF
```

## 🧪 Testing & Verification

### Runbook: Testing Checklist

#### 1. Local Development Test

```bash
# Start dev server
npm run dev

# Test dashboard loads
curl http://localhost:3000

# Test API endpoints
curl http://localhost:3000/api/kpi?startDate=2024-10-01&endDate=2024-10-15

# Test report generation
curl http://localhost:3000/report?period=weekly
```

#### 2. Database Test

```bash
# Check connection
npm run prisma:studio

# Verify dimensions
psql $DATABASE_URL << EOF
SELECT 'DimDate' as table, COUNT(*) FROM dim_date
UNION ALL
SELECT 'DimChannel', COUNT(*) FROM dim_channel
UNION ALL
SELECT 'DimLocation', COUNT(*) FROM dim_location
UNION ALL
SELECT 'FactOrder', COUNT(*) FROM fact_order
UNION ALL
SELECT 'FactOrderLine', COUNT(*) FROM fact_order_line
UNION ALL
SELECT 'FactEvent', COUNT(*) FROM fact_event;
EOF

# Check materialized view
psql $DATABASE_URL << EOF
SELECT * FROM mv_kpi_daily
ORDER BY date DESC
LIMIT 10;
EOF

# Verify indexes
psql $DATABASE_URL << EOF
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
EOF
```

#### 3. Integration Test

```bash
# Test Shopify connection
curl -X POST http://localhost:3000/api/test/shopify \
  -H "Authorization: Bearer $WEBHOOK_SECRET"

# Test Square connection
curl -X POST http://localhost:3000/api/test/square \
  -H "Authorization: Bearer $WEBHOOK_SECRET"

# Test AnyRoad connection
curl -X POST http://localhost:3000/api/test/anyroad \
  -H "Authorization: Bearer $WEBHOOK_SECRET"

# Or use the built-in test functions in lib/*
npm run test:shopify
npm run test:square
npm run test:anyroad
```

#### 4. Webhook Test

```bash
# Test Shopify webhook (using Shopify CLI)
shopify webhook trigger --topic orders/create

# Test Square webhook (manual JSON)
curl -X POST http://localhost:3000/api/webhooks/square \
  -H "Content-Type: application/json" \
  -H "x-square-signature: YOUR_SIGNATURE" \
  -d @test/fixtures/square-order-created.json

# Verify webhook received
psql $DATABASE_URL << EOF
SELECT *
FROM ingest_audit
WHERE type LIKE 'webhook_%'
ORDER BY ts DESC
LIMIT 10;
EOF
```

#### 5. Backfill Test

```bash
# Small date range test
npm run shopify:backfill -- --days 7
npm run square:backfill -- --days 7
npm run anyroad:backfill -- --days 7

# Verify data loaded
npm run reconcile -- --days 7

# Check for errors
psql $DATABASE_URL << EOF
SELECT source, type, status, error
FROM ingest_audit
WHERE status = 'error'
ORDER BY ts DESC;
EOF
```

#### 6. Report Test

```bash
# Generate test report
curl -X GET "http://localhost:3000/api/send-report?period=weekly" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -o test-report.pdf

# Verify PDF
open test-report.pdf  # macOS
start test-report.pdf  # Windows

# Test email delivery
curl -X POST "http://localhost:3000/api/send-report?period=daily" \
  -H "Authorization: Bearer $CRON_SECRET"

# Check Resend dashboard for delivery status
```

#### 7. Performance Test

```bash
# Test query performance
psql $DATABASE_URL << EOF
EXPLAIN ANALYZE
SELECT * FROM mv_kpi_daily
WHERE date >= '2024-10-01'
  AND "channelId" = 'shopify';
EOF
# Should use index, complete <10ms

# Test dashboard load time
curl -w "@curl-format.txt" https://your-domain.vercel.app/
# Should be <1s cold start

# Test MV refresh time
time npm run views:refresh
# Should complete in <30s for 10K orders
```

#### 8. Resync Test

```bash
# Test resync API
curl -X POST https://your-domain.vercel.app/api/admin/resync \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "shopify",
    "date": "2024-10-15"
  }'

# Verify resync occurred
psql $DATABASE_URL << EOF
SELECT *
FROM ingest_audit
WHERE type = 'resync'
  AND payload->>'date' = '2024-10-15'
ORDER BY ts DESC
LIMIT 1;
EOF
```

### Quick Reference Commands

```bash
# Development
npm run dev                    # Start dev server
npm run build                  # Build for production
npm run start                  # Start production server

# Database
npm run prisma:generate        # Generate Prisma client
npm run prisma:migrate         # Run migrations
npm run prisma:studio          # Open Prisma Studio
npm run seed                   # Seed dimension tables

# Materialized Views
npm run views:create           # Create MV
npm run views:refresh          # Refresh MV

# Data Loading
npm run shopify:backfill       # Backfill Shopify
npm run square:backfill        # Backfill Square
npm run anyroad:backfill       # Backfill AnyRoad
npm run reconcile              # Verify data integrity

# Deployment
vercel                         # Deploy preview
vercel --prod                  # Deploy production
vercel logs --follow           # Stream logs
vercel env pull                # Download env vars
```

### API Endpoints Reference

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/` | GET | None | Dashboard UI |
| `/report` | GET | None | Report page (SSR) |
| `/api/kpi` | GET | None | KPI data (cached 5min) |
| `/api/webhooks/shopify` | POST | HMAC | Shopify webhooks |
| `/api/webhooks/square` | POST | Signature | Square webhooks |
| `/api/webhooks/anyroad` | POST | HMAC | AnyRoad webhooks |
| `/api/send-report` | GET | Bearer | Download PDF |
| `/api/send-report` | POST | Bearer | Send email |
| `/api/refresh-views` | GET | None | Refresh MV (cron) |
| `/api/admin/resync` | POST | Bearer | Manual resync |

**Auth Headers:**
- Bearer: `Authorization: Bearer $WEBHOOK_SECRET`
- HMAC: `X-Shopify-Hmac-Sha256` (Shopify) or `X-AnyRoad-Signature` (AnyRoad)
- Signature: `x-square-signature` (Square)

## 📚 Additional Resources

- **API Guide**: See `API_GUIDE.md` for detailed API documentation
- **Prisma Schema**: See `prisma/schema.prisma` for data model
- **Environment Template**: See `.env.example` for all variables

## 📄 License

MIT

## 🤝 Support

For issues and questions:
1. Check this README and API_GUIDE.md
2. Review IngestAudit logs in database
3. Check Vercel function logs
4. Open GitHub issue
