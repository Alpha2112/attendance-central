import { z } from 'zod';

export const DeadLetterEventSchema = z.object({
  deadLetterId: z.string().uuid(),
  originalTopic: z.string(),
  originalKey: z.string().optional(),
  originalPayload: z.unknown(),
  errorReason: z.string(),
  stackTrace: z.string().optional(),
  consumerGroup: z.string(),
  timestamp: z.string().datetime(),
  retryCount: z.number().int().nonnegative().default(0),
});

export type DeadLetterEvent = z.infer<typeof DeadLetterEventSchema>;
