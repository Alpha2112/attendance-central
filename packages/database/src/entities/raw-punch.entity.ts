import { type RowDataPacket } from 'mysql2/promise';

export interface RawPunchLogEntity extends RowDataPacket {
  id: number;
  event_date: string;
  tenant_id: number | null;
  organization_id: number;
  device_id: number;
  vendor: string;
  vendor_event_id: string | null;
  vendor_user_id: string;
  device_time: Date;
  received_at: Date;
  vendor_verification_code: string | null;
  vendor_punch_code: string | null;
  raw_payload: unknown;
  payload_hash: string;
  normalization_status: string;
  normalization_error_code: string | null;
  created_at: Date;
}

export interface CreateRawPunchLogDto {
  eventDate: string; // YYYY-MM-DD
  tenantId?: number;
  organizationId: number;
  deviceId: number;
  vendor: string;
  vendorEventId?: string;
  vendorUserId: string;
  deviceTime: Date | string;
  receivedAt: Date | string;
  vendorVerificationCode?: string;
  vendorPunchCode?: string;
  rawPayload: unknown;
  payloadHash: string;
  normalizationStatus?: string;
  normalizationErrorCode?: string;
}
