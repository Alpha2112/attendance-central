import { type RowDataPacket } from 'mysql2/promise';

export interface AttendanceLogEntity extends RowDataPacket {
  id: number;
  event_date: string;
  tenant_id: number | null;
  organization_id: number;
  branch_id: number | null;
  employee_id: string;
  device_id: number;
  vendor: string;
  raw_log_id: number;
  punch_time: Date;
  punch_time_utc: Date;
  device_timestamp: Date | null;
  received_at: Date;
  punch_type: string;
  verification_type: string;
  clock_offset_seconds: number | null;
  source: string;
  sync_mode: string; // 'AUTOMATIC' | 'MANUAL'
  sync_job_id: number | null;
  vendor_event_id: string | null;
  event_fingerprint: string;
  created_at: Date;
}

export interface CreateAttendanceLogDto {
  eventDate: string; // YYYY-MM-DD
  tenantId?: number;
  organizationId: number;
  branchId?: number;
  employeeId: string;
  deviceId: number;
  vendor: string;
  rawLogId: number;
  punchTime: Date | string;
  punchTimeUtc: Date | string;
  deviceTimestamp?: Date | string;
  receivedAt: Date | string;
  punchType: string;
  verificationType: string;
  clockOffsetSeconds?: number;
  source?: string;
  /** 'AUTOMATIC' (default) for poller/realtime, 'MANUAL' for the manual sync workflow. */
  syncMode?: string;
  /** Links a manually synced row to its sync_jobs audit record. */
  syncJobId?: number | null;
  vendorEventId?: string;
  eventFingerprint: string;
}
