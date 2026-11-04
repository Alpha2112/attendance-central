import { DatabaseClient } from '../pool.js';
import { type TenantEntity, type CreateTenantDto } from '../entities/tenant.entity.js';
import { type ResultSetHeader } from 'mysql2/promise';

export class TenantRepository {
  constructor(private readonly client: DatabaseClient) {}

  public async findById(id: number): Promise<TenantEntity | null> {
    const rows = await this.client.query<TenantEntity[]>(
      'SELECT * FROM tenants WHERE id = ? LIMIT 1',
      [id],
    );
    return rows[0] || null;
  }

  public async findByCode(code: string): Promise<TenantEntity | null> {
    const rows = await this.client.query<TenantEntity[]>(
      'SELECT * FROM tenants WHERE code = ? LIMIT 1',
      [code],
    );
    return rows[0] || null;
  }

  public async list(): Promise<TenantEntity[]> {
    return this.client.query<TenantEntity[]>('SELECT * FROM tenants ORDER BY name ASC');
  }

  public async create(dto: CreateTenantDto): Promise<number> {
    const result = await this.client.query<ResultSetHeader>(
      `INSERT INTO tenants (code, name, status) VALUES (?, ?, ?)`,
      [dto.code, dto.name, dto.status || 'ACTIVE'],
    );
    return result.insertId;
  }

  public async update(id: number, dto: Partial<CreateTenantDto>): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (dto.code !== undefined) {
      sets.push('code = ?');
      params.push(dto.code);
    }
    if (dto.name !== undefined) {
      sets.push('name = ?');
      params.push(dto.name);
    }
    if (dto.status !== undefined) {
      sets.push('status = ?');
      params.push(dto.status);
    }
    if (sets.length === 0) return;
    params.push(id);
    await this.client.query(`UPDATE tenants SET ${sets.join(', ')} WHERE id = ?`, params);
  }

  public async delete(id: number): Promise<void> {
    await this.client.query('DELETE FROM tenants WHERE id = ?', [id]);
  }

  /** How many organizations reference this tenant (for delete guards / display). */
  public async organizationCount(id: number): Promise<number> {
    const rows = await this.client.query<Array<{ n: number } & import('mysql2/promise').RowDataPacket>>(
      'SELECT COUNT(*) AS n FROM organizations WHERE tenant_id = ?',
      [id],
    );
    return Number(rows[0]?.n ?? 0);
  }
}
