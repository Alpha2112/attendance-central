import { z } from 'zod';

export const SyncRequestedEventSchema = z.object({
  jobId: z.string().uuid(),
  schemaVersion: z.literal(1).default(1),
  tenantId: z.string().optional(),
  organizationId: z.string(),
  deviceId: z.string(),
  jobType: z.string(),
  timeRange: z
    .object({
      from: z.string().datetime(),
      to: z.string().datetime(),
    })
    .optional(),
  requestedBy: z.string(),
  requestedAt: z.string().datetime(),
});

export type SyncRequestedEvent = z.infer<typeof SyncRequestedEventSchema>;

export const SyncCompletedEventSchema = z.object({
  jobId: z.string().uuid(),
  schemaVersion: z.literal(1).default(1),
  organizationId: z.string(),
  deviceId: z.string(),
  jobType: z.string(),
  recordsReceived: z.number().int().nonnegative(),
  recordsInserted: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
});

export type SyncCompletedEvent = z.infer<typeof SyncCompletedEventSchema>;

export const SyncFailedEventSchema = z.object({
  jobId: z.string().uuid(),
  schemaVersion: z.literal(1).default(1),
  organizationId: z.string(),
  deviceId: z.string(),
  jobType: z.string(),
  errorCode: z.string(),
  errorMessage: z.string(),
  failedAt: z.string().datetime(),
});

export type SyncFailedEvent = z.infer<typeof SyncFailedEventSchema>;
