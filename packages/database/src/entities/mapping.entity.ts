import { type RowDataPacket } from 'mysql2/promise';

export interface DeviceEmployeeMappingEntity extends RowDataPacket {
  id: number;
  tenant_id: number | null;
  organization_id: number;
  device_id: number;
  external_employee_id: string;
  vendor_user_id: string;
  vendor_employee_code: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface DeviceEmployeeMappingWithDevice extends DeviceEmployeeMappingEntity {
  device_code?: string;
  device_name?: string;
  vendor?: string;
  model?: string;
  host?: string;
  port?: number;
}

export interface CreateMappingDto {
  tenantId?: number;
  organizationId: number;
  deviceId: number;
  externalEmployeeId: string;
  vendorUserId: string;
  vendorEmployeeCode?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}
