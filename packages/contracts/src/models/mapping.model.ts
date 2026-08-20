import { z } from 'zod';

export const DeviceEmployeeMappingSchema = z.object({
  id: z.string(),
  tenantId: z.string().nullable().optional(),
  organizationId: z.string(),
  deviceId: z.string(),

  externalEmployeeId: z.string().min(1),
  vendorUserId: z.string().min(1),
  vendorEmployeeCode: z.string().nullable().optional(),

  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
  metadata: z.record(z.unknown()).optional(),

  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export type DeviceEmployeeMapping = z.infer<typeof DeviceEmployeeMappingSchema>;
