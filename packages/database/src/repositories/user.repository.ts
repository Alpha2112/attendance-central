import { DatabaseClient } from '../pool.js';
import { type UserEntity, type RoleEntity, type CreateUserDto } from '../entities/rbac.entity.js';
import { type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';

export class UserRepository {
  constructor(private readonly client: DatabaseClient) {}

  public async findById(id: number): Promise<UserEntity | null> {
    const rows = await this.client.query<UserEntity[]>(
      'SELECT * FROM users WHERE id = ? LIMIT 1',
      [id],
    );
    return rows[0] || null;
  }

  public async findByEmail(email: string): Promise<UserEntity | null> {
    const rows = await this.client.query<UserEntity[]>(
      'SELECT * FROM users WHERE email = ? LIMIT 1',
      [email],
    );
    return rows[0] || null;
  }

  public async list(): Promise<UserEntity[]> {
    return this.client.query<UserEntity[]>('SELECT * FROM users ORDER BY created_at DESC');
  }

  public async create(dto: CreateUserDto): Promise<number> {
    const result = await this.client.query<ResultSetHeader>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, avatar_url, status, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        dto.organizationId ?? 1,
        dto.email,
        dto.passwordHash,
        dto.fullName,
        dto.avatarUrl ?? null,
        dto.status ?? 'ACTIVE',
        dto.mustChangePassword ? 1 : 0,
      ],
    );
    return result.insertId;
  }

  public async update(
    id: number,
    dto: {
      email?: string;
      fullName?: string;
      avatarUrl?: string | null;
      status?: string;
      passwordHash?: string;
      mustChangePassword?: boolean;
    },
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (dto.email !== undefined) {
      sets.push('email = ?');
      params.push(dto.email);
    }
    if (dto.fullName !== undefined) {
      sets.push('full_name = ?');
      params.push(dto.fullName);
    }
    if (dto.avatarUrl !== undefined) {
      sets.push('avatar_url = ?');
      params.push(dto.avatarUrl);
    }
    if (dto.status !== undefined) {
      sets.push('status = ?');
      params.push(dto.status);
    }
    if (dto.passwordHash !== undefined) {
      sets.push('password_hash = ?');
      params.push(dto.passwordHash);
    }
    if (dto.mustChangePassword !== undefined) {
      sets.push('must_change_password = ?');
      params.push(dto.mustChangePassword ? 1 : 0);
    }
    if (sets.length === 0) return;
    params.push(id);
    await this.client.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
  }

  public async touchLastLogin(id: number): Promise<void> {
    await this.client.query('UPDATE users SET last_login_at = NOW(6) WHERE id = ?', [id]);
  }

  public async delete(id: number): Promise<void> {
    await this.client.query('DELETE FROM users WHERE id = ?', [id]);
  }

  // ---------------- role assignment ----------------

  public async getRoles(userId: number): Promise<RoleEntity[]> {
    return this.client.query<RoleEntity[]>(
      `SELECT r.* FROM roles r
       INNER JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = ?
       ORDER BY r.name ASC`,
      [userId],
    );
  }

  public async setRoles(userId: number, roleIds: number[]): Promise<void> {
    await this.client.query('DELETE FROM user_roles WHERE user_id = ?', [userId]);
    if (roleIds.length === 0) return;
    const values = roleIds.map(() => '(?, ?)').join(', ');
    const params: unknown[] = [];
    for (const rid of roleIds) {
      params.push(userId, rid);
    }
    await this.client.query(
      `INSERT IGNORE INTO user_roles (user_id, role_id) VALUES ${values}`,
      params,
    );
  }

  /** Distinct permission codes granted to a user through all of their roles. */
  public async getPermissionCodes(userId: number): Promise<string[]> {
    const rows = await this.client.query<Array<{ code: string } & RowDataPacket>>(
      `SELECT DISTINCT p.code
       FROM permissions p
       INNER JOIN role_permissions rp ON rp.permission_id = p.id
       INNER JOIN user_roles ur ON ur.role_id = rp.role_id
       WHERE ur.user_id = ?`,
      [userId],
    );
    return rows.map((r) => r.code);
  }
}
