import { type RowDataPacket } from 'mysql2/promise';

export interface AuditLogEntity extends RowDataPacket {
  id: number;
  tenant_id: number | null;
  organization_id: number;
  actor_type: string;
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  before_state: unknown;
  after_state: unknown;
  ip_address: string | null;
  user_agent: string | null;
  correlation_id: string | null;
  created_at: Date;
}

export interface CreateAuditLogDto {
  tenantId?: number;
  organizationId: number;
  actorType: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  beforeState?: unknown;
  afterState?: unknown;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
}
