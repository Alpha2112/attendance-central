import { DatabaseClient } from '../pool.js';
import { type AuditLogEntity, type CreateAuditLogDto } from '../entities/audit.entity.js';
import { type ResultSetHeader } from 'mysql2/promise';

export class AuditLogRepository {
  constructor(private readonly client: DatabaseClient) {}

  public async record(dto: CreateAuditLogDto): Promise<number> {
    const result = await this.client.query<ResultSetHeader>(
      `INSERT INTO audit_logs (
        tenant_id, organization_id, actor_type, actor_id,
        action, resource_type, resource_id, before_state,
        after_state, ip_address, user_agent, correlation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dto.tenantId || null,
        dto.organizationId,
        dto.actorType,
        dto.actorId,
        dto.action,
        dto.resourceType,
        dto.resourceId,
        dto.beforeState ? JSON.stringify(dto.beforeState) : null,
        dto.afterState ? JSON.stringify(dto.afterState) : null,
        dto.ipAddress || null,
        dto.userAgent || null,
        dto.correlationId || null,
      ],
    );
    return result.insertId;
  }

  public async listByOrg(organizationId: number, limit: number = 50): Promise<AuditLogEntity[]> {
    return this.client.query<AuditLogEntity[]>(
      'SELECT * FROM audit_logs WHERE organization_id = ? ORDER BY id DESC LIMIT ?',
      [organizationId, limit],
    );
  }
}
