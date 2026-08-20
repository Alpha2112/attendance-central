import { type RowDataPacket } from 'mysql2/promise';

export interface SyncJobEntity extends RowDataPacket {
  id: number;
  organization_id: number;
  device_id: number;
  job_type: string;
  status: string;
  requested_by: string;
  requested_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  records_received: number;
  records_inserted: number;
  duplicates: number;
  errors: number;
  retry_count: number;
  error_code: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SyncCheckpointEntity extends RowDataPacket {
  id: number;
  device_id: number;
  stream_type: string;
  last_vendor_event_id: string | null;
  last_event_time: Date | null;
  cursor: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSyncJobDto {
  organizationId: number;
  deviceId: number;
  jobType: string;
  requestedBy: string;
  requestedAt?: Date | string;
}
