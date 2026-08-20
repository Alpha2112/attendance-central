import { z } from 'zod';
import { DeviceStatus } from '../enums.js';

export const DeviceModelSchema = z.object({
  id: z.string(),
  tenantId: z.string().nullable().optional(),
  organizationId: z.string(),
  branchId: z.string().nullable().optional(),
  deviceTypeId: z.string().nullable().optional(),

  deviceCode: z.string().min(1),
  serialNumber: z.string().optional(),
  name: z.string(),

  vendor: z.string(),
  model: z.string().optional(),
  protocol: z.string().optional(),
  connectionMode: z.enum(['PUSH', 'PULL', 'HYBRID']),

  host: z.string().optional(),
  port: z.number().int().positive().optional(),
  timezone: z.string(),

  secretReference: z.string().optional(),

  status: z.nativeEnum(DeviceStatus),
  lastSeenAt: z.string().datetime({ offset: true }).nullable().optional(),
  lastSyncAt: z.string().datetime({ offset: true }).nullable().optional(),

  firmwareVersion: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),

  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export type DeviceModel = z.infer<typeof DeviceModelSchema>;
