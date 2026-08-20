import { z } from 'zod';
import { DeviceVendor, EventSource } from '../enums.js';

export const RawAttendanceEventSchema = z.object({
  eventId: z.string().uuid(),
  schemaVersion: z.literal(1).default(1),
  tenantId: z.string().optional(),
  organizationId: z.string(),
  branchId: z.string().optional(),
  deviceId: z.string(),
  deviceSerialNumber: z.string().optional(),
  vendor: z.nativeEnum(DeviceVendor).or(z.string()),
  adapter: z.string(),
  vendorEventId: z.string().optional(),
  vendorUserId: z.string().min(1),
  deviceTime: z.string().datetime(),
  receivedAt: z.string().datetime(),
  vendorPunchType: z.string().optional(),
  vendorVerificationType: z.string().optional(),
  source: z.nativeEnum(EventSource).default(EventSource.PUSH),
  rawPayload: z.unknown(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type RawAttendanceEvent = z.infer<typeof RawAttendanceEventSchema>;
