import { type RowDataPacket } from 'mysql2/promise';

export interface OrganizationEntity extends RowDataPacket {
  id: number;
  tenant_id: number | null;
  /** Self-referencing parent for the org tree; NULL = root (top-level) org. */
  parent_id: number | null;
  code: string;
  name: string;
  timezone: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateOrganizationDto {
  tenantId?: number | null;
  parentId?: number | null;
  code: string;
  name: string;
  timezone?: string;
  status?: string;
}
