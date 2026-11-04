import { DatabaseClient } from '../pool.js';
import {
  type OrganizationEntity,
  type CreateOrganizationDto,
} from '../entities/organization.entity.js';
import { type ResultSetHeader } from 'mysql2/promise';

export class OrganizationRepository {
  constructor(private readonly client: DatabaseClient) {}

  public async findById(id: number): Promise<OrganizationEntity | null> {
    const rows = await this.client.query<OrganizationEntity[]>(
      'SELECT * FROM organizations WHERE id = ? LIMIT 1',
      [id],
    );
    return rows[0] || null;
  }

  public async findByCode(code: string): Promise<OrganizationEntity | null> {
    const rows = await this.client.query<OrganizationEntity[]>(
      'SELECT * FROM organizations WHERE code = ? LIMIT 1',
      [code],
    );
    return rows[0] || null;
  }

  public async create(dto: CreateOrganizationDto): Promise<number> {
    const result = await this.client.query<ResultSetHeader>(
      `INSERT INTO organizations (tenant_id, code, name, timezone, status)
       VALUES (?, ?, ?, ?, ?)`,
      [dto.tenantId || null, dto.code, dto.name, dto.timezone || 'UTC', dto.status || 'ACTIVE'],
    );
    return result.insertId;
  }

  public async list(): Promise<OrganizationEntity[]> {
    return this.client.query<OrganizationEntity[]>('SELECT * FROM organizations ORDER BY name ASC');
  }

  public async listByTenant(tenantId: number): Promise<OrganizationEntity[]> {
    return this.client.query<OrganizationEntity[]>(
      'SELECT * FROM organizations WHERE tenant_id = ? ORDER BY name ASC',
      [tenantId],
    );
  }

  public async update(
    id: number,
    dto: {
      tenantId?: number | null;
      code?: string;
      name?: string;
      timezone?: string;
      status?: string;
    },
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (dto.tenantId !== undefined) {
      sets.push('tenant_id = ?');
      params.push(dto.tenantId || null);
    }
    if (dto.code !== undefined) {
      sets.push('code = ?');
      params.push(dto.code);
    }
    if (dto.name !== undefined) {
      sets.push('name = ?');
      params.push(dto.name);
    }
    if (dto.timezone !== undefined) {
      sets.push('timezone = ?');
      params.push(dto.timezone);
    }
    if (dto.status !== undefined) {
      sets.push('status = ?');
      params.push(dto.status);
    }
    if (sets.length === 0) return;
    params.push(id);
    await this.client.query(`UPDATE organizations SET ${sets.join(', ')} WHERE id = ?`, params);
  }

  public async delete(id: number): Promise<void> {
    await this.client.query('DELETE FROM organizations WHERE id = ?', [id]);
  }
}
