import { type RowDataPacket } from 'mysql2/promise';

export interface BranchEntity extends RowDataPacket {
  id: number;
  tenant_id: number | null;
  organization_id: number;
  code: string;
  name: string;
  timezone: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateBranchDto {
  tenantId?: number;
  organizationId: number;
  code: string;
  name: string;
  timezone?: string;
  metadata?: Record<string, unknown>;
}
