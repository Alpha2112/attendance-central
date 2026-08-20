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
    return this.client.query<OrganizationEntity[]>('SELECT * FROM organizations ORDER BY id ASC');
  }
}
