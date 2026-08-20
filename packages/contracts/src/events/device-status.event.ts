import { z } from 'zod';
import { DeviceStatus } from '../enums.js';

export const DeviceStatusEventSchema = z.object({
  eventId: z.string().uuid(),
  schemaVersion: z.literal(1).default(1),
  tenantId: z.string().optional(),
  organizationId: z.string(),
  deviceId: z.string(),
  status: z.nativeEnum(DeviceStatus),
  latencyMs: z.number().int().nonnegative().optional(),
  clockOffsetSeconds: z.number().int().optional(),
  firmwareVersion: z.string().optional(),
  ipAddress: z.string().optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  observedAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type DeviceStatusEvent = z.infer<typeof DeviceStatusEventSchema>;
