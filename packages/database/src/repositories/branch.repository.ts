import { DatabaseClient } from '../pool.js';
import { type BranchEntity, type CreateBranchDto } from '../entities/branch.entity.js';
import { type ResultSetHeader } from 'mysql2/promise';

export class BranchRepository {
  constructor(private readonly client: DatabaseClient) {}

  public async findById(id: number): Promise<BranchEntity | null> {
    const rows = await this.client.query<BranchEntity[]>(
      'SELECT * FROM branches WHERE id = ? LIMIT 1',
      [id],
    );
    return rows[0] || null;
  }

  public async findByOrgAndCode(
    organizationId: number,
    code: string,
  ): Promise<BranchEntity | null> {
    const rows = await this.client.query<BranchEntity[]>(
      'SELECT * FROM branches WHERE organization_id = ? AND code = ? LIMIT 1',
      [organizationId, code],
    );
    return rows[0] || null;
  }

  public async create(dto: CreateBranchDto): Promise<number> {
    const result = await this.client.query<ResultSetHeader>(
      `INSERT INTO branches (tenant_id, organization_id, code, name, timezone, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        dto.tenantId || null,
        dto.organizationId,
        dto.code,
        dto.name,
        dto.timezone || 'UTC',
        dto.metadata ? JSON.stringify(dto.metadata) : null,
      ],
    );
    return result.insertId;
  }

  public async listByOrg(organizationId: number): Promise<BranchEntity[]> {
    return this.client.query<BranchEntity[]>(
      'SELECT * FROM branches WHERE organization_id = ? ORDER BY id ASC',
      [organizationId],
    );
  }
}
