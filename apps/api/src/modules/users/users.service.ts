import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  DatabaseClient,
  UserRepository,
  RoleRepository,
  hashPassword,
} from '@attendance/database';

export interface UserRoleView {
  id: number;
  code: string;
  name: string;
}

export interface UserView {
  id: number;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  status: string;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  roles: UserRoleView[];
  createdAt: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class UsersService {
  private readonly users: UserRepository;
  private readonly roles: RoleRepository;

  constructor(@Inject(DatabaseClient) private readonly db: DatabaseClient) {
    this.users = new UserRepository(this.db);
    this.roles = new RoleRepository(this.db);
  }

  public async list(): Promise<UserView[]> {
    const rows = await this.users.list();
    const views = await Promise.all(
      rows.map(async (u) => {
        const roles = await this.users.getRoles(u.id);
        return this.toView(u, roles);
      }),
    );
    return views;
  }

  public async getOne(id: number): Promise<UserView> {
    const u = await this.users.findById(id);
    if (!u) throw new NotFoundException(`User ${id} not found`);
    const roles = await this.users.getRoles(id);
    return this.toView(u, roles);
  }

  public async create(dto: {
    email?: string;
    fullName?: string;
    password?: string;
    status?: string;
    roleIds?: number[];
  }): Promise<UserView> {
    const email = this.requireEmail(dto.email);
    const fullName = this.requireName(dto.fullName);
    const password = this.requirePassword(dto.password);
    if (await this.users.findByEmail(email)) {
      throw new BadRequestException(`A user with email "${email}" already exists.`);
    }
    const passwordHash = await hashPassword(password);
    const id = await this.users.create({
      email,
      fullName,
      passwordHash,
      status: dto.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      mustChangePassword: true,
    });
    await this.assignValidRoles(id, dto.roleIds ?? []);
    return this.getOne(id);
  }

  public async update(
    id: number,
    dto: { email?: string; fullName?: string; status?: string; avatarUrl?: string | null },
  ): Promise<UserView> {
    const existing = await this.users.findById(id);
    if (!existing) throw new NotFoundException(`User ${id} not found`);
    const patch: { email?: string; fullName?: string; status?: string; avatarUrl?: string | null } =
      {};
    if (dto.email !== undefined) {
      const email = this.requireEmail(dto.email);
      const clash = await this.users.findByEmail(email);
      if (clash && clash.id !== id) {
        throw new BadRequestException(`A user with email "${email}" already exists.`);
      }
      patch.email = email;
    }
    if (dto.fullName !== undefined) patch.fullName = this.requireName(dto.fullName);
    if (dto.status !== undefined) patch.status = dto.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
    if (dto.avatarUrl !== undefined) patch.avatarUrl = dto.avatarUrl;
    await this.users.update(id, patch);
    return this.getOne(id);
  }

  public async setStatus(id: number, active: boolean, actingUserId: number): Promise<UserView> {
    const existing = await this.users.findById(id);
    if (!existing) throw new NotFoundException(`User ${id} not found`);
    if (!active && id === actingUserId) {
      throw new ForbiddenException('You cannot deactivate your own account.');
    }
    await this.users.update(id, { status: active ? 'ACTIVE' : 'INACTIVE' });
    return this.getOne(id);
  }

  public async resetPassword(id: number, newPassword?: string): Promise<{ success: true }> {
    const existing = await this.users.findById(id);
    if (!existing) throw new NotFoundException(`User ${id} not found`);
    const password = this.requirePassword(newPassword);
    const passwordHash = await hashPassword(password);
    await this.users.update(id, { passwordHash, mustChangePassword: true });
    return { success: true };
  }

  public async assignRoles(id: number, roleIds: number[]): Promise<UserView> {
    const existing = await this.users.findById(id);
    if (!existing) throw new NotFoundException(`User ${id} not found`);
    await this.assignValidRoles(id, roleIds);
    return this.getOne(id);
  }

  public async remove(id: number, actingUserId: number): Promise<{ success: true }> {
    const existing = await this.users.findById(id);
    if (!existing) throw new NotFoundException(`User ${id} not found`);
    if (id === actingUserId) {
      throw new ForbiddenException('You cannot delete your own account.');
    }
    await this.users.delete(id);
    return { success: true };
  }

  // ---------------- helpers ----------------

  private async assignValidRoles(userId: number, roleIds: number[]): Promise<void> {
    const unique = [...new Set(roleIds.map((r) => Number(r)).filter((r) => Number.isFinite(r)))];
    for (const rid of unique) {
      if (!(await this.roles.findById(rid))) {
        throw new BadRequestException(`Role ${rid} does not exist.`);
      }
    }
    await this.users.setRoles(userId, unique);
  }

  private requireEmail(email: string | undefined): string {
    const v = (email ?? '').trim().toLowerCase();
    if (!v || !EMAIL_RE.test(v)) throw new BadRequestException('A valid email is required.');
    return v;
  }

  private requireName(name: string | undefined): string {
    const v = (name ?? '').trim();
    if (!v) throw new BadRequestException('Full name is required.');
    if (v.length > 255) throw new BadRequestException('Full name is too long.');
    return v;
  }

  private requirePassword(password: string | undefined): string {
    const v = password ?? '';
    if (v.length < 8) throw new BadRequestException('Password must be at least 8 characters.');
    return v;
  }

  private toView(
    u: import('@attendance/database').UserEntity,
    roles: import('@attendance/database').RoleEntity[],
  ): UserView {
    return {
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      avatarUrl: u.avatar_url,
      status: u.status,
      mustChangePassword: u.must_change_password === 1,
      lastLoginAt: u.last_login_at ? new Date(u.last_login_at).toISOString() : null,
      roles: roles.map((r) => ({ id: r.id, code: r.code, name: r.name })),
      createdAt: u.created_at ? new Date(u.created_at).toISOString() : new Date().toISOString(),
    };
  }
}
