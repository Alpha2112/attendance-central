import { z } from 'zod';
import { DeviceVendor, PunchType, VerificationType, EventSource } from '../enums.js';

export const AttendanceEventSchema = z.object({
  eventId: z.string().uuid(),
  schemaVersion: z.literal(1).default(1),
  tenantId: z.string().optional(),
  organizationId: z.string(),
  branchId: z.string().optional(),
  employeeId: z.string().min(1),
  deviceId: z.string(),
  deviceSerialNumber: z.string().optional(),
  vendor: z.nativeEnum(DeviceVendor).or(z.string()),
  rawLogId: z.number().int().positive().optional(),
  punchTime: z.string().datetime(),
  punchTimeUtc: z.string().datetime(),
  deviceTimestamp: z.string().datetime().optional(),
  receivedAt: z.string().datetime(),
  punchType: z.nativeEnum(PunchType),
  verificationType: z.nativeEnum(VerificationType),
  clockOffsetSeconds: z.number().int().optional(),
  source: z.nativeEnum(EventSource).default(EventSource.PUSH),
  vendorEventId: z.string().optional(),
  eventFingerprint: z.string().min(16),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type AttendanceEvent = z.infer<typeof AttendanceEventSchema>;
