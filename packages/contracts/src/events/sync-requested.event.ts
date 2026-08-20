import { z } from 'zod';

export enum SyncType {
  ATTENDANCE = 'ATTENDANCE',
  RECONCILIATION = 'RECONCILIATION',
  STATUS = 'STATUS',
}

export const SyncRequestedEventSchema = z.object({
  eventId: z.string().min(1),
  schemaVersion: z.literal(1),

  organizationId: z.string().min(1),
  deviceId: z.string().min(1),

  syncJobId: z.string().min(1),

  type: z.nativeEnum(SyncType),

  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),

  requestedAt: z.string().datetime({ offset: true }),
  requestedBy: z.string().min(1),
});

export type SyncRequestedEvent = z.infer<typeof SyncRequestedEventSchema>;
