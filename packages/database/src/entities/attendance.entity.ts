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
  vendorEventId?: string;
  eventFingerprint: string;
}
