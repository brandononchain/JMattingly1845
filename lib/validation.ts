import { z } from 'zod';

// Common schemas
export const dateRangeSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const channelSchema = z.enum(['shopify', 'square', 'anyroad', 'all']);

// Dashboard query params
export const dashboardParamsSchema = z.object({
  channel: channelSchema.optional().default('all'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// Webhook payloads
export const shopifyWebhookSchema = z.object({
  id: z.union([z.string(), z.number()]),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const squareWebhookSchema = z.object({
  type: z.string(),
  data: z.object({
    object: z.record(z.unknown()),
  }),
});

export const anyroadWebhookSchema = z.object({
  event_type: z.string(),
  data: z.record(z.unknown()),
});

// Admin resync
export const resyncSchema = z.object({
  channel: z.enum(['shopify', 'square', 'anyroad', 'all']),
  type: z.enum(['parallel', 'sequential', 'skip-reconcile']).optional().default('sequential'),
});

// Report generation
export const reportParamsSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  recipients: z.array(z.string().email()).optional(),
});

// Type exports
export type DashboardParams = z.infer<typeof dashboardParamsSchema>;
export type Channel = z.infer<typeof channelSchema>;
export type ResyncParams = z.infer<typeof resyncSchema>;
export type ReportParams = z.infer<typeof reportParamsSchema>;

