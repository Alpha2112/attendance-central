import { z } from 'zod';
import { CommandType, CommandStatus } from '../enums.js';

export const DeviceCommandEventSchema = z.object({
  commandId: z.string().uuid(),
  schemaVersion: z.literal(1).default(1),
  tenantId: z.string().optional(),
  organizationId: z.string(),
  deviceId: z.string(),
  commandType: z.nativeEnum(CommandType),
  payload: z.record(z.string(), z.unknown()).optional(),
  issuedBy: z.string(),
  issuedAt: z.string().datetime(),
  timeoutSeconds: z.number().int().positive().default(30),
});

export type DeviceCommandEvent = z.infer<typeof DeviceCommandEventSchema>;

export const DeviceCommandResultEventSchema = z.object({
  commandId: z.string().uuid(),
  schemaVersion: z.literal(1).default(1),
  tenantId: z.string().optional(),
  organizationId: z.string(),
  deviceId: z.string(),
  commandType: z.nativeEnum(CommandType),
  status: z.nativeEnum(CommandStatus),
  executedAt: z.string().datetime(),
  latencyMs: z.number().int().nonnegative().optional(),
  resultPayload: z.record(z.string(), z.unknown()).optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
});

export type DeviceCommandResultEvent = z.infer<typeof DeviceCommandResultEventSchema>;
