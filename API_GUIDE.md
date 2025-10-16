# API Guide

Complete API reference for J. Mattingly 1845 Analytics Dashboard.

## Base URL

```
Production: https://your-domain.vercel.app
Development: http://localhost:3000
```

## Authentication

### Methods

| Type | Header | Value | Used By |
|------|--------|-------|---------|
| **Bearer Token** | `Authorization` | `Bearer $WEBHOOK_SECRET` | Admin APIs |
| **HMAC (Shopify)** | `X-Shopify-Hmac-Sha256` | SHA-256 HMAC | Shopify webhooks |
| **HMAC (AnyRoad)** | `X-AnyRoad-Signature` | HMAC | AnyRoad webhooks |
| **Signature (Square)** | `x-square-signature` | Signature | Square webhooks |
| **Cron Secret** | `Authorization` | `Bearer $CRON_SECRET` | Cron jobs |

## Public APIs

### Dashboard

#### GET `/`

Main analytics dashboard.

**Query Parameters:**
- `period` (string, optional): `today` | `wtd` | `mtd` | `ytd` | `custom`
- `channel` (string, optional): `all` | `shopify` | `square` | `anyroad`
- `location` (string, optional): Location ID or `all`
- `startDate` (string, optional): ISO date (if `period=custom`)
- `endDate` (string, optional): ISO date (if `period=custom`)

**Example:**
```bash
curl "https://your-domain.vercel.app/?period=mtd&channel=shopify"
```

**Response:** HTML page

---

### Report Page

#### GET `/report`

Server-rendered report page for PDF generation.

**Query Parameters:**
- `period` (string, required): `daily` | `weekly` | `monthly` | `custom`
- `date` (string, optional): ISO date (defaults to today)
- `startDate` (string, optional): ISO date (if `period=custom`)
- `endDate` (string, optional): ISO date (if `period=custom`)

**Example:**
```bash
curl "https://your-domain.vercel.app/report?period=weekly&date=2024-10-15"
```

**Response:** HTML page (optimized for print/PDF)

---

### KPI API

#### GET `/api/kpi`

Fetch KPI data (cached 5 minutes).

**Query Parameters:**
- `startDate` (string, required): ISO date
- `endDate` (string, required): ISO date
- `channel` (string, optional): Channel ID

**Example:**
```bash
curl "https://your-domain.vercel.app/api/kpi?startDate=2024-10-01&endDate=2024-10-15&channel=shopify"
```

**Response:**
```json
{
  "kpis": {
    "sales": 125000.50,
    "transactions": 450,
    "aov": 277.78,
    "itemsPerCustomer": 2.3,
    "growthVsPrevious": 15.2
  },
  "trend": [
    {
      "date": "2024-10-01",
      "sales": 5000,
      "units": 120,
      "transactions": 40
    }
  ],
  "timestamp": "2024-10-16T12:00:00Z"
}
```

---

## Webhook APIs

### Shopify Webhooks

#### POST `/api/webhooks/shopify`

Receive Shopify webhook events.

**Headers:**
- `X-Shopify-Hmac-Sha256` (required): HMAC signature
- `X-Shopify-Topic` (required): Event topic
- `X-Shopify-Shop-Domain` (required): Store domain

**Topics Handled:**
- `orders/create`
- `orders/updated`
- `refunds/create`

**Example:**
```bash
curl -X POST "https://your-domain.vercel.app/api/webhooks/shopify" \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Hmac-Sha256: <signature>" \
  -H "X-Shopify-Topic: orders/create" \
  -H "X-Shopify-Shop-Domain: yourstore.myshopify.com" \
  -d @shopify-order.json
```

**Response:**
```json
{
  "received": true,
  "topic": "orders/create",
  "orderId": "123456789",
  "processed": true
}
```

**Errors:**
- `401 Unauthorized`: Invalid HMAC signature
- `400 Bad Request`: Missing required headers
- `500 Internal Server Error`: Processing failed

---

### Square Webhooks

#### POST `/api/webhooks/square`

Receive Square webhook events.

**Headers:**
- `x-square-signature` (required): Webhook signature
- `Content-Type`: `application/json`

**Events Handled:**
- `order.created`
- `order.updated`
- `payment.created`
- `payment.updated`

**Example:**
```bash
curl -X POST "https://your-domain.vercel.app/api/webhooks/square" \
  -H "Content-Type: application/json" \
  -H "x-square-signature: <signature>" \
  -d '{
    "merchant_id": "MERCHANT_ID",
    "type": "payment.created",
    "event_id": "evt_123",
    "created_at": "2024-10-15T12:00:00Z",
    "data": {
      "type": "payment",
      "id": "pay_123",
      "object": { ... }
    }
  }'
```

**Response:**
```json
{
  "received": true,
  "eventType": "payment.created",
  "eventId": "evt_123"
}
```

---

### AnyRoad Webhooks

#### POST `/api/webhooks/anyroad`

Receive AnyRoad webhook events.

**Headers:**
- `X-AnyRoad-Signature` (required): HMAC signature
- `Content-Type`: `application/json`

**Events Handled:**
- `booking.created`
- `booking.updated`
- `booking.cancelled`
- `experience.created`
- `experience.updated`

**Example:**
```bash
curl -X POST "https://your-domain.vercel.app/api/webhooks/anyroad" \
  -H "Content-Type: application/json" \
  -H "X-AnyRoad-Signature: <signature>" \
  -d '{
    "event": "booking.created",
    "data": {
      "id": "booking_123",
      "experience_id": "exp_456",
      "guests": 4,
      "total": 200.00
    }
  }'
```

**Response:**
```json
{
  "received": true,
  "event": "booking.created",
  "bookingId": "booking_123"
}
```

---

## Report APIs

### Download Report PDF

#### GET `/api/send-report`

Download report as PDF.

**Authentication:** Bearer token

**Query Parameters:**
- `period` (string, required): `daily` | `weekly` | `monthly` | `custom`
- `date` (string, optional): ISO date (defaults to today)
- `startDate` (string, optional): ISO date (if `period=custom`)
- `endDate` (string, optional): ISO date (if `period=custom`)

**Example:**
```bash
curl -X GET "https://your-domain.vercel.app/api/send-report?period=weekly" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -o report.pdf
```

**Response:** PDF file (application/pdf)

---

### Send Report Email

#### POST `/api/send-report`

Generate and email report to recipients.

**Authentication:** Bearer token

**Query Parameters:**
- `period` (string, optional): `daily` | `weekly` | `monthly` (for cron)

**Body (optional):**
```json
{
  "period": "custom",
  "startDate": "2024-10-01",
  "endDate": "2024-10-15",
  "recipients": ["custom@email.com"]
}
```

**Example:**
```bash
curl -X POST "https://your-domain.vercel.app/api/send-report?period=weekly" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "success": true,
  "period": "weekly",
  "reportDate": "2024-10-15",
  "recipients": ["owner@jmattingly1845.com", "ops@jmattingly1845.com"],
  "emailId": "email_123xyz"
}
```

**Errors:**
- `401 Unauthorized`: Invalid/missing Bearer token
- `400 Bad Request`: Invalid period or date
- `500 Internal Server Error`: PDF generation or email send failed

---

## Admin APIs

### Manual Resync

#### POST `/api/admin/resync`

Trigger manual data resync for a specific source and date.

**Authentication:** Bearer token

**Body:**
```json
{
  "source": "shopify" | "square" | "anyroad" | "all",
  "date": "2024-10-15"
}
```

**Example:**
```bash
curl -X POST "https://your-domain.vercel.app/api/admin/resync" \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "shopify",
    "date": "2024-10-15"
  }'
```

**Response:**
```json
{
  "success": true,
  "source": "shopify",
  "date": "2024-10-15",
  "recordsProcessed": 247,
  "duration": "12.3s",
  "mvRefreshed": true
}
```

**Errors:**
- `401 Unauthorized`: Invalid/missing Bearer token
- `400 Bad Request`: Invalid source or date
- `500 Internal Server Error`: Resync failed

---

### Refresh Materialized Views

#### GET `/api/refresh-views`

Refresh materialized views (called by Vercel Cron).

**Authentication:** None (rate-limited by Vercel Cron)

**Example:**
```bash
curl -X GET "https://your-domain.vercel.app/api/refresh-views"
```

**Response:**
```json
{
  "success": true,
  "view": "mv_kpi_daily",
  "refreshed": true,
  "duration": "8.2s",
  "timestamp": "2024-10-16T06:00:00Z"
}
```

---

## Data Models

### KPI Response

```typescript
interface KpiData {
  sales: number;           // Total revenue
  transactions: number;    // Order count
  aov: number;            // Average order value
  itemsPerCustomer: number; // Avg items per order
  growthVsPrevious: number; // % growth vs previous period
}
```

### Daily Trend

```typescript
interface DailyTrend {
  date: string;           // ISO date
  sales: number;          // Revenue
  units: number;          // Items sold
  transactions: number;   // Orders
}
```

### Top Item

```typescript
interface TopItem {
  rank: number;
  sku: string;
  productTitle: string;
  category: string | null;
  revenue: number;
  qty: number;
}
```

### Top Category

```typescript
interface TopCategory {
  rank: number;
  category: string;
  revenue: number;
  share: number;  // % of total revenue
}
```

## Rate Limits

### Vercel Edge Functions

- **Concurrent executions**: 1000
- **Duration**: 30s max
- **Memory**: 1024 MB

### External APIs

| Source | Limit | Handled By |
|--------|-------|------------|
| Shopify GraphQL | 50 points/sec | `lib/shopify.ts` throttling |
| Shopify REST | 2 req/sec | Not used |
| Square | 10 req/sec | Square SDK |
| AnyRoad | 100 req/min | `lib/anyroad.ts` throttling |

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "timestamp": "2024-10-16T12:00:00Z"
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| `UNAUTHORIZED` | Missing or invalid authentication |
| `BAD_REQUEST` | Invalid request parameters |
| `NOT_FOUND` | Resource not found |
| `RATE_LIMITED` | Too many requests |
| `INTERNAL_ERROR` | Server error |
| `EXTERNAL_API_ERROR` | External service failed |

## Webhook Security

### Shopify HMAC Verification

```typescript
import crypto from 'crypto';

function verifyShopifyHmac(body: string, hmac: string): boolean {
  const hash = crypto
    .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET!)
    .update(body)
    .digest('base64');
  
  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(hmac)
  );
}
```

### Square Signature Verification

```typescript
import crypto from 'crypto';

function verifySquareSignature(body: string, signature: string, url: string): boolean {
  const payload = url + body;
  const hash = crypto
    .createHmac('sha256', process.env.SQUARE_WEBHOOK_SECRET!)
    .update(payload)
    .digest('base64');
  
  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(signature)
  );
}
```

### AnyRoad HMAC Verification

```typescript
import crypto from 'crypto';

function verifyAnyroadHmac(body: string, signature: string): boolean {
  const hash = crypto
    .createHmac('sha256', process.env.ANYROAD_WEBHOOK_SECRET!)
    .update(body)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(signature)
  );
}
```

## Testing

### Using curl

```bash
# Set variables
export BASE_URL="http://localhost:3000"
export WEBHOOK_SECRET="your-secret"

# Test KPI API
curl "$BASE_URL/api/kpi?startDate=2024-10-01&endDate=2024-10-15"

# Test report download
curl -H "Authorization: Bearer $WEBHOOK_SECRET" \
  "$BASE_URL/api/send-report?period=weekly" \
  -o test-report.pdf

# Test resync
curl -X POST "$BASE_URL/api/admin/resync" \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"source": "shopify", "date": "2024-10-15"}'
```

### Using Postman

1. Import collection from `postman_collection.json`
2. Set environment variables:
   - `BASE_URL`: Your deployment URL
   - `WEBHOOK_SECRET`: Your webhook secret
   - `CRON_SECRET`: Your cron secret
3. Run tests

## Monitoring

### Audit Logs

All webhook and API activity is logged in `IngestAudit`:

```sql
SELECT 
  source,
  type,
  status,
  ts,
  payload,
  error
FROM ingest_audit
WHERE ts >= NOW() - INTERVAL '24 hours'
ORDER BY ts DESC;
```

### Vercel Logs

```bash
# Stream logs
vercel logs --follow

# Filter by function
vercel logs --follow app/api/webhooks/shopify/route.ts

# Check errors only
vercel logs --follow | grep ERROR
```

## Support

For API issues:
1. Check this guide
2. Review `IngestAudit` table for detailed logs
3. Check Vercel function logs
4. Open GitHub issue with request/response details

