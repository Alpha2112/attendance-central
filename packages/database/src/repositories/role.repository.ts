import { DatabaseClient } from '../pool.js';
import { type RoleEntity, type PermissionEntity, type CreateRoleDto } from '../entities/rbac.entity.js';
import { type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';

export class RoleRepository {
  constructor(private readonly client: DatabaseClient) {}

  public async findById(id: number): Promise<RoleEntity | null> {
    const rows = await this.client.query<RoleEntity[]>('SELECT * FROM roles WHERE id = ? LIMIT 1', [
      id,
    ]);
    return rows[0] || null;
  }

  public async findByCode(code: string): Promise<RoleEntity | null> {
    const rows = await this.client.query<RoleEntity[]>(
      'SELECT * FROM roles WHERE code = ? LIMIT 1',
      [code],
    );
    return rows[0] || null;
  }

  public async list(): Promise<RoleEntity[]> {
    return this.client.query<RoleEntity[]>('SELECT * FROM roles ORDER BY is_system DESC, name ASC');
  }

  public async create(dto: CreateRoleDto): Promise<number> {
    const result = await this.client.query<ResultSetHeader>(
      `INSERT INTO roles (code, name, description, is_system, organization_id)
       VALUES (?, ?, ?, ?, ?)`,
      [dto.code, dto.name, dto.description ?? null, dto.isSystem ? 1 : 0, dto.organizationId ?? null],
    );
    return result.insertId;
  }

  public async update(
    id: number,
    dto: { code?: string; name?: string; description?: string | null },
  ): Promise<void> {
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
    if (dto.description !== undefined) {
      sets.push('description = ?');
      params.push(dto.description);
    }
    if (sets.length === 0) return;
    params.push(id);
    await this.client.query(`UPDATE roles SET ${sets.join(', ')} WHERE id = ?`, params);
  }

  public async delete(id: number): Promise<void> {
    await this.client.query('DELETE FROM roles WHERE id = ?', [id]);
  }

  public async getPermissionIds(roleId: number): Promise<number[]> {
    const rows = await this.client.query<Array<{ permission_id: number } & RowDataPacket>>(
      'SELECT permission_id FROM role_permissions WHERE role_id = ?',
      [roleId],
    );
    return rows.map((r) => r.permission_id);
  }

  public async getPermissions(roleId: number): Promise<PermissionEntity[]> {
    return this.client.query<PermissionEntity[]>(
      `SELECT p.* FROM permissions p
       INNER JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = ?
       ORDER BY p.module, p.page, p.action`,
      [roleId],
    );
  }

  public async setPermissions(roleId: number, permissionIds: number[]): Promise<void> {
    await this.client.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
    if (permissionIds.length === 0) return;
    const values = permissionIds.map(() => '(?, ?)').join(', ');
    const params: unknown[] = [];
    for (const pid of permissionIds) {
      params.push(roleId, pid);
    }
    await this.client.query(
      `INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES ${values}`,
      params,
    );
  }

  /** How many users hold this role (for delete guards / display). */
  public async userCount(roleId: number): Promise<number> {
    const rows = await this.client.query<Array<{ n: number } & RowDataPacket>>(
      'SELECT COUNT(*) AS n FROM user_roles WHERE role_id = ?',
      [roleId],
    );
    return Number(rows[0]?.n ?? 0);
  }
}
