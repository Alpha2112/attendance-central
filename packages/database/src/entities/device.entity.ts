import { type RowDataPacket } from 'mysql2/promise';

export interface DeviceTypeEntity extends RowDataPacket {
  id: number;
  vendor: string;
  model: string;
  protocol: string;
  adapter_key: string;
  capabilities: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface DeviceEntity extends RowDataPacket {
  id: number;
  tenant_id: number | null;
  organization_id: number;
  branch_id: number | null;
  device_type_id: number | null;
  device_code: string;
  serial_number: string | null;
  name: string;
  vendor: string;
  model: string | null;
  protocol: string | null;
  connection_mode: 'PUSH' | 'PULL' | 'HYBRID';
  host: string | null;
  port: number | null;
  timezone: string;
  secret_reference: string | null;
  status: string;
  last_seen_at: Date | null;
  last_sync_at: Date | null;
  firmware_version: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateDeviceDto {
  tenantId?: number;
  organizationId: number;
  branchId?: number;
  deviceTypeId?: number;
  deviceCode: string;
  serialNumber?: string;
  name: string;
  vendor: string;
  model?: string;
  protocol?: string;
  connectionMode?: 'PUSH' | 'PULL' | 'HYBRID';
  host?: string;
  port?: number;
  timezone?: string;
  secretReference?: string;
  status?: string;
  firmwareVersion?: string;
  metadata?: Record<string, unknown>;
}
