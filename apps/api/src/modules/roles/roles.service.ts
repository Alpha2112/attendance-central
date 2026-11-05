import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  DatabaseClient,
  RoleRepository,
  PermissionRepository,
  type RoleEntity,
  type PermissionEntity,
} from '@attendance/database';

export interface RoleView {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissionCount: number;
  userCount: number;
  createdAt: string;
}

export interface RoleDetail extends RoleView {
  permissionIds: number[];
}

export interface PermissionView {
  id: number;
  code: string;
  name: string;
  description: string;
  module: string;
  page: string;
  action: string;
}

const CODE_RE = /^[A-Za-z0-9_-]+$/;
const SUPER_ADMIN_CODE = 'SUPER_ADMIN';

@Injectable()
export class RolesService {
  private readonly roles: RoleRepository;
  private readonly permissions: PermissionRepository;

  constructor(@Inject(DatabaseClient) private readonly db: DatabaseClient) {
    this.roles = new RoleRepository(this.db);
    this.permissions = new PermissionRepository(this.db);
  }

  public async listPermissions(): Promise<PermissionView[]> {
    const rows = await this.permissions.list();
    return rows.map((p) => this.toPermView(p));
  }

  public async list(): Promise<RoleView[]> {
    const rows = await this.roles.list();
    return Promise.all(rows.map((r) => this.toView(r)));
  }

  public async getOne(id: number): Promise<RoleDetail> {
    const role = await this.roles.findById(id);
    if (!role) throw new NotFoundException(`Role ${id} not found`);
    const view = await this.toView(role);
    const permissionIds = await this.roles.getPermissionIds(id);
    return { ...view, permissionIds };
  }

  public async create(dto: {
    code?: string;
    name?: string;
    description?: string | null;
    permissionIds?: number[];
  }): Promise<RoleDetail> {
    const code = this.requireCode(dto.code);
    const name = this.requireName(dto.name);
    if (await this.roles.findByCode(code)) {
      throw new BadRequestException(`A role with code "${code}" already exists.`);
    }
    const id = await this.roles.create({
      code,
      name,
      description: dto.description ?? null,
      isSystem: false,
    });
    await this.roles.setPermissions(id, await this.validPermissionIds(dto.permissionIds ?? []));
    return this.getOne(id);
  }

  public async update(
    id: number,
    dto: { name?: string; description?: string | null },
  ): Promise<RoleDetail> {
    const role = await this.roles.findById(id);
    if (!role) throw new NotFoundException(`Role ${id} not found`);
    const patch: { name?: string; description?: string | null } = {};
    if (dto.name !== undefined) patch.name = this.requireName(dto.name);
    if (dto.description !== undefined) patch.description = dto.description;
    await this.roles.update(id, patch);
    return this.getOne(id);
  }

  public async setPermissions(id: number, permissionIds: number[]): Promise<RoleDetail> {
    const role = await this.roles.findById(id);
    if (!role) throw new NotFoundException(`Role ${id} not found`);
    if (role.code === SUPER_ADMIN_CODE) {
      throw new BadRequestException('The Super Admin role always has every permission and cannot be narrowed.');
    }
    await this.roles.setPermissions(id, await this.validPermissionIds(permissionIds));
    return this.getOne(id);
  }

  public async remove(id: number): Promise<{ success: true }> {
    const role = await this.roles.findById(id);
    if (!role) throw new NotFoundException(`Role ${id} not found`);
    if (role.is_system === 1) {
      throw new BadRequestException('System roles cannot be deleted.');
    }
    const userCount = await this.roles.userCount(id);
    if (userCount > 0) {
      throw new BadRequestException(
        `Cannot delete: ${userCount} user(s) still hold this role. Reassign them first.`,
      );
    }
    await this.roles.delete(id);
    return { success: true };
  }

  // ---------------- helpers ----------------

  private async validPermissionIds(ids: number[]): Promise<number[]> {
    const unique = [...new Set(ids.map((i) => Number(i)).filter((i) => Number.isFinite(i)))];
    if (unique.length === 0) return [];
    const found = await this.permissions.listByIds(unique);
    const foundIds = new Set(found.map((p) => p.id));
    const missing = unique.filter((i) => !foundIds.has(i));
    if (missing.length > 0) {
      throw new BadRequestException(`Unknown permission id(s): ${missing.join(', ')}.`);
    }
    return unique;
  }

  private async toView(role: RoleEntity): Promise<RoleView> {
    const [permIds, userCount] = await Promise.all([
      this.roles.getPermissionIds(role.id),
      this.roles.userCount(role.id),
    ]);
    return {
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: role.is_system === 1,
      permissionCount: permIds.length,
      userCount,
      createdAt: role.created_at ? new Date(role.created_at).toISOString() : new Date().toISOString(),
    };
  }

  private toPermView(p: PermissionEntity): PermissionView {
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      module: p.module,
      page: p.page,
      action: p.action,
    };
  }

  private requireCode(code: string | undefined): string {
    const v = (code ?? '').trim().toUpperCase().replace(/\s+/g, '_');
    if (!v) throw new BadRequestException('Role code is required.');
    if (!CODE_RE.test(v)) {
      throw new BadRequestException('Role code may only contain letters, numbers, hyphens and underscores.');
    }
    if (v.length > 100) throw new BadRequestException('Role code is too long.');
    return v;
  }

  private requireName(name: string | undefined): string {
    const v = (name ?? '').trim();
    if (!v) throw new BadRequestException('Role name is required.');
    if (v.length > 150) throw new BadRequestException('Role name is too long.');
    return v;
  }
}
