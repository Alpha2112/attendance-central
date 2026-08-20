import { z } from 'zod';

export const IntegrationDeliveryEventSchema = z.object({
  deliveryId: z.string().uuid(),
  schemaVersion: z.literal(1).default(1),
  tenantId: z.string().optional(),
  organizationId: z.string(),
  integrationId: z.string(),
  outboxEventId: z.string(),
  eventType: z.string(),
  targetUrl: z.string().url(),
  attemptNumber: z.number().int().positive(),
  payload: z.unknown(),
  deliveredAt: z.string().datetime(),
  statusCode: z.number().int(),
  latencyMs: z.number().int().nonnegative(),
});

export type IntegrationDeliveryEvent = z.infer<typeof IntegrationDeliveryEventSchema>;

export const IntegrationDeliveryFailedEventSchema = z.object({
  deliveryId: z.string().uuid(),
  schemaVersion: z.literal(1).default(1),
  tenantId: z.string().optional(),
  organizationId: z.string(),
  integrationId: z.string(),
  outboxEventId: z.string(),
  eventType: z.string(),
  targetUrl: z.string().url(),
  attemptNumber: z.number().int().positive(),
  maxAttempts: z.number().int().positive(),
  errorCode: z.string(),
  errorMessage: z.string(),
  failedAt: z.string().datetime(),
  nextRetryAt: z.string().datetime().optional(),
});

export type IntegrationDeliveryFailedEvent = z.infer<typeof IntegrationDeliveryFailedEventSchema>;
