export enum UserRole {
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',
  ORG_ADMIN = 'ORG_ADMIN',
  OPERATOR = 'OPERATOR',
  INTEGRATION_RO = 'INTEGRATION_RO',
  AUDITOR = 'AUDITOR',
}

export enum Permission {
  DEVICES_READ = 'devices:read',
  DEVICES_WRITE = 'devices:write',
  DEVICES_SYNC = 'devices:sync',
  ATTENDANCE_READ = 'attendance:read',
  ATTENDANCE_EXPORT = 'attendance:export',
  MAPPINGS_READ = 'mappings:read',
  MAPPINGS_WRITE = 'mappings:write',
  INTEGRATIONS_READ = 'integrations:read',
  INTEGRATIONS_WRITE = 'integrations:write',
  REPLAY_EVENTS = 'replay:events',
  AUDIT_READ = 'audit:read',
  SYSTEM_ADMIN = 'system:admin',
}

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  [UserRole.PLATFORM_ADMIN]: Object.values(Permission),
  [UserRole.ORG_ADMIN]: [
    Permission.DEVICES_READ,
    Permission.DEVICES_WRITE,
    Permission.DEVICES_SYNC,
    Permission.ATTENDANCE_READ,
    Permission.ATTENDANCE_EXPORT,
    Permission.MAPPINGS_READ,
    Permission.MAPPINGS_WRITE,
    Permission.INTEGRATIONS_READ,
    Permission.INTEGRATIONS_WRITE,
    Permission.REPLAY_EVENTS,
    Permission.AUDIT_READ,
  ],
  [UserRole.OPERATOR]: [
    Permission.DEVICES_READ,
    Permission.DEVICES_SYNC,
    Permission.ATTENDANCE_READ,
    Permission.MAPPINGS_READ,
    Permission.INTEGRATIONS_READ,
    Permission.REPLAY_EVENTS,
  ],
  [UserRole.INTEGRATION_RO]: [
    Permission.ATTENDANCE_READ,
    Permission.DEVICES_READ,
    Permission.MAPPINGS_READ,
  ],
  [UserRole.AUDITOR]: [
    Permission.DEVICES_READ,
    Permission.ATTENDANCE_READ,
    Permission.MAPPINGS_READ,
    Permission.INTEGRATIONS_READ,
    Permission.AUDIT_READ,
  ],
};

export interface SecurityContext {
  actorId: string;
  actorType: 'USER' | 'API_CLIENT' | 'SYSTEM';
  organizationId: string;
  roles: UserRole[];
  permissions?: Permission[];
}

export class RbacGuard {
  /**
   * Evaluates if a security context has a required permission.
   */
  public static hasPermission(context: SecurityContext, permission: Permission): boolean {
    if (context.roles.includes(UserRole.PLATFORM_ADMIN)) {
      return true;
    }

    const effectivePermissions = new Set<Permission>(context.permissions ?? []);
    for (const role of context.roles) {
      const perms = ROLE_PERMISSIONS[role] ?? [];
      for (const p of perms) {
        effectivePermissions.add(p);
      }
    }

    return effectivePermissions.has(permission);
  }

  /**
   * Strictly enforces multi-tenant boundary.
   * Throws Error if cross-organization access is attempted by a non-platform-admin.
   */
  public static assertTenantAccess(context: SecurityContext, targetOrganizationId: string): void {
    if (context.roles.includes(UserRole.PLATFORM_ADMIN)) {
      return;
    }

    if (
      !context.organizationId ||
      String(context.organizationId).trim() !== String(targetOrganizationId).trim()
    ) {
      throw new Error(
        `Cross-Organization Access Denied: Actor [${context.actorId}] belonging to Org [${context.organizationId}] cannot access target Org [${targetOrganizationId}]`,
      );
    }
  }

  /**
   * Asserts both permission and tenant access.
   */
  public static authorize(
    context: SecurityContext,
    permission: Permission,
    targetOrganizationId?: string,
  ): void {
    if (!this.hasPermission(context, permission)) {
      throw new Error(
        `Unauthorized: Actor [${context.actorId}] lacks required permission [${permission}]`,
      );
    }

    if (targetOrganizationId) {
      this.assertTenantAccess(context, targetOrganizationId);
    }
  }
}
