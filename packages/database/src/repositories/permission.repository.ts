import { DatabaseClient } from '../pool.js';
import { type PermissionEntity } from '../entities/rbac.entity.js';

export class PermissionRepository {
  constructor(private readonly client: DatabaseClient) {}

  public async list(): Promise<PermissionEntity[]> {
    return this.client.query<PermissionEntity[]>(
      'SELECT * FROM permissions ORDER BY module, page, action',
    );
  }

  public async listByIds(ids: number[]): Promise<PermissionEntity[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(', ');
    return this.client.query<PermissionEntity[]>(
      `SELECT * FROM permissions WHERE id IN (${placeholders})`,
      ids,
    );
  }

  public async allIds(): Promise<number[]> {
    const rows = await this.client.query<PermissionEntity[]>('SELECT id FROM permissions');
    return rows.map((r) => r.id);
  }
}
