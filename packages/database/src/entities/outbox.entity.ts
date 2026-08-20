import { type RowDataPacket } from 'mysql2/promise';

export interface OutboxEventEntity extends RowDataPacket {
  id: number;
  event_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: unknown;
  status: 'PENDING' | 'PUBLISHED' | 'FAILED';
  available_at: Date;
  created_at: Date;
  published_at: Date | null;
  attempt_count: number;
  last_error: string | null;
}

export interface CreateOutboxEventDto {
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  availableAt?: Date | string;
}
