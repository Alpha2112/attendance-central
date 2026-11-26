import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  DatabaseClient,
  OrganizationRepository,
  TenantRepository,
  DeviceEmployeeMappingRepository,
  type OrganizationEntity,
  type TenantEntity,
} from '@attendance/database';

export interface UpsertTenantDto {
  code?: string;
  name?: string;
  status?: string;
}

export interface UpsertOrganizationDto {
  code?: string;
  name?: string;
  tenantId?: number | null;
  /** Parent organization id for the tree; null/0 = root (top-level) org. */
  parentId?: number | null;
  timezone?: string;
  status?: string;
}

export interface TenantView {
  id: number;
  code: string;
  name: string;
  status: string;
  organizationCount: number;
  createdAt: string;
}

export interface OrganizationView {
  id: number;
  code: string;
  name: string;
  tenantId: number | null;
  tenantName: string | null;
  /** Parent org id in the tree; null = a root (top-level) organization. */
  parentId: number | null;
  /** Parent org name for display; null when this is a root. */
  parentName: string | null;
  timezone: string;
  status: string;
  createdAt: string;
}

const CODE_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Registry for Tenants and Organizations used by the Sender Webhook form.
 * A Tenant owns many Organizations (organizations.tenant_id -> tenants.id).
 */
@Injectable()
export class RegistryService {
  private readonly orgRepo: OrganizationRepository;
  private readonly tenantRepo: TenantRepository;
  private readonly mappingRepo: DeviceEmployeeMappingRepository;

  constructor(@Inject(DatabaseClient) private readonly db: DatabaseClient) {
    this.orgRepo = new OrganizationRepository(this.db);
    this.tenantRepo = new TenantRepository(this.db);
    this.mappingRepo = new DeviceEmployeeMappingRepository(this.db);
  }

  // ---------------- Tenants ----------------

  public async listTenants(): Promise<TenantView[]> {
    const tenants = await this.tenantRepo.list();
    const orgs = await this.orgRepo.list();
    const counts = new Map<number, number>();
    for (const o of orgs) {
      if (o.tenant_id != null) counts.set(o.tenant_id, (counts.get(o.tenant_id) ?? 0) + 1);
    }
    return tenants.map((t) => this.toTenantView(t, counts.get(t.id) ?? 0));
  }

  public async createTenant(dto: UpsertTenantDto): Promise<TenantView> {
    const code = this.requireCode(dto.code, 'Tenant code');
    const name = this.requireName(dto.name, 'Tenant name');
    if (await this.tenantRepo.findByCode(code)) {
      throw new BadRequestException(`A tenant with code "${code}" already exists.`);
    }
    const id = await this.tenantRepo.create({ code, name, status: dto.status || 'ACTIVE' });
    const created = await this.tenantRepo.findById(id);
    return this.toTenantView(created!, 0);
  }

  public async updateTenant(id: number, dto: UpsertTenantDto): Promise<TenantView> {
    const existing = await this.tenantRepo.findById(id);
    if (!existing) throw new NotFoundException(`Tenant ${id} not found`);
    if (dto.code !== undefined) {
      const code = this.requireCode(dto.code, 'Tenant code');
      const clash = await this.tenantRepo.findByCode(code);
      if (clash && clash.id !== id) {
        throw new BadRequestException(`A tenant with code "${code}" already exists.`);
      }
      dto.code = code;
    }
    if (dto.name !== undefined) dto.name = this.requireName(dto.name, 'Tenant name');
    await this.tenantRepo.update(id, dto);
    const updated = await this.tenantRepo.findById(id);
    const count = await this.tenantRepo.organizationCount(id);
    return this.toTenantView(updated!, count);
  }

  public async deleteTenant(id: number): Promise<void> {
    const existing = await this.tenantRepo.findById(id);
    if (!existing) throw new NotFoundException(`Tenant ${id} not found`);
    const count = await this.tenantRepo.organizationCount(id);
    if (count > 0) {
      throw new BadRequestException(
        `Cannot delete this tenant: ${count} organization(s) still belong to it. Reassign or delete them first.`,
      );
    }
    await this.tenantRepo.delete(id);
  }

  // ---------------- Organizations ----------------

  public async listOrganizations(tenantId?: number): Promise<OrganizationView[]> {
    const orgs = tenantId ? await this.orgRepo.listByTenant(tenantId) : await this.orgRepo.list();
    const tenants = await this.tenantRepo.list();
    const tenantById = new Map<number, TenantEntity>(tenants.map((t) => [t.id, t]));
    // Resolve parent names from the FULL org set (a child's parent may sit
    // outside a tenant-filtered subset, or carry a different tenant).
    const allOrgs = tenantId ? await this.orgRepo.list() : orgs;
    const orgById = new Map<number, OrganizationEntity>(allOrgs.map((o) => [o.id, o]));
    return orgs.map((o) =>
      this.toOrgView(
        o,
        o.tenant_id != null ? tenantById.get(o.tenant_id) ?? null : null,
        o.parent_id != null ? orgById.get(o.parent_id) ?? null : null,
      ),
    );
  }

  public async createOrganization(dto: UpsertOrganizationDto): Promise<OrganizationView> {
    const code = this.requireCode(dto.code, 'Organization code');
    const name = this.requireName(dto.name, 'Organization name');
    if (await this.orgRepo.findByCode(code)) {
      throw new BadRequestException(`An organization with code "${code}" already exists.`);
    }
    const tenant = await this.resolveTenant(dto.tenantId);
    // A brand-new org has no descendants yet, so the only check on its parent is
    // that it exists (no cycle is possible on create).
    const parent = await this.resolveParent(dto.parentId, null);
    const id = await this.orgRepo.create({
      code,
      name,
      tenantId: tenant?.id ?? null,
      parentId: parent?.id ?? null,
      timezone: dto.timezone || 'UTC',
      status: dto.status || 'ACTIVE',
    });
    const created = await this.orgRepo.findById(id);
    return this.toOrgView(created!, tenant, parent);
  }

  public async updateOrganization(id: number, dto: UpsertOrganizationDto): Promise<OrganizationView> {
    const existing = await this.orgRepo.findById(id);
    if (!existing) throw new NotFoundException(`Organization ${id} not found`);
    if (dto.code !== undefined) {
      const code = this.requireCode(dto.code, 'Organization code');
      const clash = await this.orgRepo.findByCode(code);
      if (clash && clash.id !== id) {
        throw new BadRequestException(`An organization with code "${code}" already exists.`);
      }
      dto.code = code;
    }
    if (dto.name !== undefined) dto.name = this.requireName(dto.name, 'Organization name');
    let tenant: TenantEntity | null = null;
    if (dto.tenantId !== undefined) {
      tenant = await this.resolveTenant(dto.tenantId);
      dto.tenantId = tenant?.id ?? null;
    }
    let parent: OrganizationEntity | null = null;
    if (dto.parentId !== undefined) {
      parent = await this.resolveParent(dto.parentId, id);
      dto.parentId = parent?.id ?? null;
    }
    await this.orgRepo.update(id, dto);
    const updated = await this.orgRepo.findById(id);
    const finalTenant =
      dto.tenantId !== undefined
        ? tenant
        : updated!.tenant_id != null
          ? await this.tenantRepo.findById(updated!.tenant_id)
          : null;
    const finalParent =
      dto.parentId !== undefined
        ? parent
        : updated!.parent_id != null
          ? await this.orgRepo.findById(updated!.parent_id)
          : null;
    return this.toOrgView(updated!, finalTenant, finalParent);
  }

  public async deleteOrganization(id: number): Promise<void> {
    const existing = await this.orgRepo.findById(id);
    if (!existing) throw new NotFoundException(`Organization ${id} not found`);

    // Employee mappings are protected by a RESTRICT foreign key, so the DB would
    // reject the delete with a generic 500. Surface a clear 400 instead.
    const mappingCount = await this.mappingRepo.countByOrganization(id);
    if (mappingCount > 0) {
      throw new BadRequestException(
        `Cannot delete this organization: ${mappingCount} employee mapping(s) still reference it. Reassign or remove those mappings first.`,
      );
    }

    // Children are promoted to roots by the DB (ON DELETE SET NULL); no sub-tree
    // is destroyed.
    await this.orgRepo.delete(id);
  }

  // ---------------- helpers ----------------

  private async resolveTenant(tenantId?: number | null): Promise<TenantEntity | null> {
    if (tenantId === undefined || tenantId === null) return null;
    const tenant = await this.tenantRepo.findById(Number(tenantId));
    if (!tenant) throw new BadRequestException(`Tenant ${tenantId} does not exist.`);
    return tenant;
  }

  /**
   * Resolve and validate a prospective parent organization.
   *  - null / 0 / undefined -> root org (no parent).
   *  - the parent must exist.
   *  - an org cannot be its own parent, nor a descendant of itself (that would
   *    create a cycle in the tree). `selfId` is the org being edited (null on
   *    create, where no cycle is possible).
   */
  private async resolveParent(
    parentId: number | null | undefined,
    selfId: number | null,
  ): Promise<OrganizationEntity | null> {
    if (parentId === undefined || parentId === null || Number(parentId) === 0) return null;
    const pid = Number(parentId);
    if (Number.isNaN(pid)) throw new BadRequestException('Parent organization id is invalid.');

    if (selfId !== null && pid === selfId) {
      throw new BadRequestException('An organization cannot be its own parent.');
    }

    const parent = await this.orgRepo.findById(pid);
    if (!parent) throw new BadRequestException(`Parent organization ${pid} does not exist.`);

    // Walk up the prospective parent's ancestor chain. If we ever reach the org
    // being edited, assigning this parent would form a cycle (the chosen parent
    // is actually a descendant of this org).
    if (selfId !== null) {
      const seen = new Set<number>();
      let cursor: OrganizationEntity | null = parent;
      while (cursor) {
        if (cursor.id === selfId) {
          throw new BadRequestException(
            'Cannot move an organization under one of its own descendants.',
          );
        }
        if (seen.has(cursor.id)) break; // guard against pre-existing bad data
        seen.add(cursor.id);
        cursor = cursor.parent_id != null ? await this.orgRepo.findById(cursor.parent_id) : null;
      }
    }

    return parent;
  }

  private requireCode(code: string | undefined, label: string): string {
    const v = (code ?? '').trim();
    if (!v) throw new BadRequestException(`${label} is required.`);
    if (!CODE_RE.test(v)) {
      throw new BadRequestException(`${label} may only contain letters, numbers, hyphens and underscores.`);
    }
    if (v.length > 100) throw new BadRequestException(`${label} is too long.`);
    return v;
  }

  private requireName(name: string | undefined, label: string): string {
    const v = (name ?? '').trim();
    if (!v) throw new BadRequestException(`${label} is required.`);
    if (v.length > 255) throw new BadRequestException(`${label} is too long.`);
    return v;
  }

  private toTenantView(t: TenantEntity, organizationCount: number): TenantView {
    return {
      id: t.id,
      code: t.code,
      name: t.name,
      status: t.status,
      organizationCount,
      createdAt: t.created_at ? new Date(t.created_at).toISOString() : new Date().toISOString(),
    };
  }

  private toOrgView(
    o: OrganizationEntity,
    tenant: TenantEntity | null,
    parent: OrganizationEntity | null,
  ): OrganizationView {
    return {
      id: o.id,
      code: o.code,
      name: o.name,
      tenantId: o.tenant_id ?? null,
      tenantName: tenant?.name ?? null,
      parentId: o.parent_id ?? null,
      parentName: parent?.name ?? null,
      timezone: o.timezone,
      status: o.status,
      createdAt: o.created_at ? new Date(o.created_at).toISOString() : new Date().toISOString(),
    };
  }
}
