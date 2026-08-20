import { z } from 'zod';
import { DeviceVendor } from '../enums.js';

export const NormalizationFailedEventSchema = z.object({
  eventId: z.string().uuid(),
  schemaVersion: z.literal(1).default(1),
  rawEventId: z.string(),
  organizationId: z.string(),
  deviceId: z.string(),
  vendor: z.nativeEnum(DeviceVendor).or(z.string()),
  vendorUserId: z.string(),
  reason: z.string(),
  errorCode: z.string(),
  rawPayload: z.unknown(),
  failedAt: z.string().datetime(),
});

export type NormalizationFailedEvent = z.infer<typeof NormalizationFailedEventSchema>;
