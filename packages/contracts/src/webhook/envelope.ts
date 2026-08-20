import { z } from 'zod';

export const WebhookEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string(),
  timestamp: z.string().datetime(),
  organizationId: z.string(),
  attemptNumber: z.number().int().positive().default(1),
  data: z.unknown(),
});

export type WebhookEnvelope<T = unknown> = {
  eventId: string;
  eventType: string;
  timestamp: string;
  organizationId: string;
  attemptNumber: number;
  data: T;
};
