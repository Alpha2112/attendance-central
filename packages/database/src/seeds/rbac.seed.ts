/**
 * RBAC seeder — idempotent. Run with: pnpm --filter @attendance/database seed:rbac
 *
 * Seeds:
 *   1. The full permission catalog (one row per protected action).
 *   2. System roles: SUPER_ADMIN (all), ADMIN (all except role management),
 *      VIEWER (read-only).
 *   3. A bootstrap super-admin user.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  SET YOUR SUPER-ADMIN HERE (or via env vars before running the seeder):    │
 * │    SEED_SUPERADMIN_EMAIL, SEED_SUPERADMIN_PASSWORD, SEED_SUPERADMIN_NAME    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { loadDatabaseConfig } from '@attendance/config';
import { createLogger } from '@attendance/logging';
import { DatabaseClient } from '../pool.js';
import { hashPassword } from '../security/password.js';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

// --- EDIT THESE (or override with env vars) ---------------------------------
const SUPERADMIN_EMAIL = process.env.SEED_SUPERADMIN_EMAIL || 'superadmin@techive.local';
const SUPERADMIN_PASSWORD = process.env.SEED_SUPERADMIN_PASSWORD || 'ChangeMe#123';
const SUPERADMIN_NAME = process.env.SEED_SUPERADMIN_NAME || 'Platform Super Admin';
// Force a password change on first login unless explicitly disabled.
const FORCE_PASSWORD_CHANGE = process.env.SEED_SUPERADMIN_FORCE_CHANGE !== 'false';
// ----------------------------------------------------------------------------

interface PermDef {
  code: string;
  name: string;
  description: string;
  module: string;
  page: string;
  action: string;
}

/**
 * The permission catalog. Each entry says exactly which page it guards and which
 * action it unlocks, so assigning permissions to a role is self-explanatory.
 */
const PERMISSIONS: PermDef[] = [
  // Dashboard
  { code: 'dashboard.view', name: 'View Dashboard', description: 'Access the main Dashboard overview page.', module: 'Core Platform', page: 'Dashboard', action: 'view' },

  // Punches (Live + Punch Logs)
  { code: 'punches.view', name: 'View Punches', description: 'View the Live Punch Stream and Historical Punch Logs.', module: 'Core Platform', page: 'Punch Logs', action: 'view' },
  { code: 'punches.sync', name: 'Sync Terminal', description: 'Trigger a manual "Sync Real Terminal" pull from a device.', module: 'Core Platform', page: 'Punch Logs', action: 'sync' },
  { code: 'punches.simulate', name: 'Simulate Punch', description: 'Inject a simulated punch event for testing.', module: 'Core Platform', page: 'Live Punch Stream', action: 'create' },
  { code: 'punches.export', name: 'Export Punches', description: 'Export punch logs to CSV.', module: 'Core Platform', page: 'Punch Logs', action: 'export' },
  { code: 'punches.delete', name: 'Delete Punch', description: 'Delete an individual punch record.', module: 'Core Platform', page: 'Punch Logs', action: 'delete' },
  { code: 'punches.purge', name: 'Purge All Punches', description: 'Clear all punch logs (destructive).', module: 'Core Platform', page: 'Punch Logs', action: 'delete' },

  // Device Fleet
  { code: 'devices.view', name: 'View Devices', description: 'View the Device Registry and device details.', module: 'Device Fleet', page: 'Device Registry', action: 'view' },
  { code: 'devices.create', name: 'Register Device', description: 'Register a new biometric terminal.', module: 'Device Fleet', page: 'Device Registry', action: 'create' },
  { code: 'devices.edit', name: 'Edit Device', description: 'Edit device configuration and connection settings.', module: 'Device Fleet', page: 'Device Registry', action: 'edit' },
  { code: 'devices.delete', name: 'Delete Device', description: 'Remove a device from the registry.', module: 'Device Fleet', page: 'Device Registry', action: 'delete' },
  { code: 'devices.test', name: 'Test Device Connection', description: 'Probe a device connection / status.', module: 'Device Fleet', page: 'Device Registry', action: 'test' },

  // Identity Mappings
  { code: 'mappings.view', name: 'View Mappings', description: 'View device-to-employee identity mappings.', module: 'Device Fleet', page: 'Identity Mappings', action: 'view' },
  { code: 'mappings.create', name: 'Create Mapping', description: 'Create a device-to-employee identity mapping.', module: 'Device Fleet', page: 'Identity Mappings', action: 'create' },
  { code: 'mappings.edit', name: 'Edit Mapping', description: 'Edit an existing identity mapping.', module: 'Device Fleet', page: 'Identity Mappings', action: 'edit' },
  { code: 'mappings.delete', name: 'Delete Mapping', description: 'Delete an identity mapping.', module: 'Device Fleet', page: 'Identity Mappings', action: 'delete' },

  // Organizations & Tenants
  { code: 'organizations.view', name: 'View Organizations', description: 'View registered organizations.', module: 'Outbound & Telemetry', page: 'Organizations & Tenants', action: 'view' },
  { code: 'organizations.create', name: 'Create Organization', description: 'Register a new organization.', module: 'Outbound & Telemetry', page: 'Organizations & Tenants', action: 'create' },
  { code: 'organizations.edit', name: 'Edit Organization', description: 'Edit an organization.', module: 'Outbound & Telemetry', page: 'Organizations & Tenants', action: 'edit' },
  { code: 'organizations.delete', name: 'Delete Organization', description: 'Delete an organization.', module: 'Outbound & Telemetry', page: 'Organizations & Tenants', action: 'delete' },
  { code: 'tenants.view', name: 'View Tenants', description: 'View registered tenants.', module: 'Outbound & Telemetry', page: 'Organizations & Tenants', action: 'view' },
  { code: 'tenants.create', name: 'Create Tenant', description: 'Register a new tenant.', module: 'Outbound & Telemetry', page: 'Organizations & Tenants', action: 'create' },
  { code: 'tenants.edit', name: 'Edit Tenant', description: 'Edit a tenant.', module: 'Outbound & Telemetry', page: 'Organizations & Tenants', action: 'edit' },
  { code: 'tenants.delete', name: 'Delete Tenant', description: 'Delete a tenant.', module: 'Outbound & Telemetry', page: 'Organizations & Tenants', action: 'delete' },

  // Integrations & Outbox
  { code: 'integrations.view', name: 'View Integrations', description: 'View webhook integrations and the outbox.', module: 'Outbound & Telemetry', page: 'Integrations & Outbox', action: 'view' },
  { code: 'integrations.create', name: 'Create Integration', description: 'Register a new webhook integration.', module: 'Outbound & Telemetry', page: 'Integrations & Outbox', action: 'create' },
  { code: 'integrations.edit', name: 'Edit Integration', description: 'Edit a webhook integration.', module: 'Outbound & Telemetry', page: 'Integrations & Outbox', action: 'edit' },
  { code: 'integrations.delete', name: 'Delete Integration', description: 'Delete a webhook integration.', module: 'Outbound & Telemetry', page: 'Integrations & Outbox', action: 'delete' },
  { code: 'integrations.test', name: 'Test Integration', description: 'Send a test webhook dispatch.', module: 'Outbound & Telemetry', page: 'Integrations & Outbox', action: 'test' },

  // Alerts & DLQ
  { code: 'alerts.view', name: 'View Alerts', description: 'View alerts and the dead-letter queue.', module: 'Outbound & Telemetry', page: 'Alerts & DLQ', action: 'view' },
  { code: 'alerts.manage', name: 'Manage Alerts', description: 'Retry/resolve alerts and DLQ entries.', module: 'Outbound & Telemetry', page: 'Alerts & DLQ', action: 'edit' },

  // Audit
  { code: 'audit.view', name: 'View Audit Logs', description: 'View, search and filter the system audit log.', module: 'Outbound & Telemetry', page: 'Audit Logs', action: 'view' },
  { code: 'audit.export', name: 'Export Audit Logs', description: 'Export the audit trail to CSV.', module: 'Outbound & Telemetry', page: 'Audit Logs', action: 'export' },

  // Settings
  { code: 'settings.view', name: 'View Settings', description: 'View platform settings.', module: 'Outbound & Telemetry', page: 'Platform Settings', action: 'view' },
  { code: 'settings.edit', name: 'Edit Settings', description: 'Change platform settings.', module: 'Outbound & Telemetry', page: 'Platform Settings', action: 'edit' },

  // Access Control — Users
  { code: 'users.view', name: 'View Users', description: 'View the Users Management list and profiles.', module: 'Access Control', page: 'Users', action: 'view' },
  { code: 'users.create', name: 'Create User', description: 'Add a new application user.', module: 'Access Control', page: 'Users', action: 'create' },
  { code: 'users.edit', name: 'Edit User', description: 'Edit a user profile and information.', module: 'Access Control', page: 'Users', action: 'edit' },
  { code: 'users.delete', name: 'Delete User', description: 'Delete an application user.', module: 'Access Control', page: 'Users', action: 'delete' },
  { code: 'users.activate', name: 'Activate/Deactivate User', description: 'Activate or deactivate a user account.', module: 'Access Control', page: 'Users', action: 'edit' },
  { code: 'users.reset_password', name: 'Reset User Password', description: "Reset another user's password.", module: 'Access Control', page: 'Users', action: 'edit' },
  { code: 'users.assign_roles', name: 'Assign User Roles', description: 'Assign or change the roles held by a user.', module: 'Access Control', page: 'Users', action: 'edit' },

  // Access Control — Roles & Permissions
  { code: 'roles.view', name: 'View Roles', description: 'View roles and their permissions.', module: 'Access Control', page: 'Roles', action: 'view' },
  { code: 'roles.create', name: 'Create Role', description: 'Create a new role.', module: 'Access Control', page: 'Roles', action: 'create' },
  { code: 'roles.edit', name: 'Edit Role', description: 'Edit a role name/description.', module: 'Access Control', page: 'Roles', action: 'edit' },
  { code: 'roles.delete', name: 'Delete Role', description: 'Delete a (non-system) role.', module: 'Access Control', page: 'Roles', action: 'delete' },
  { code: 'roles.assign_permissions', name: 'Assign Role Permissions', description: 'Attach or detach permissions on a role.', module: 'Access Control', page: 'Roles', action: 'edit' },
  { code: 'permissions.view', name: 'View Permission Catalog', description: 'View the catalog of available permissions.', module: 'Access Control', page: 'Roles', action: 'view' },
];

interface RoleDef {
  code: string;
  name: string;
  description: string;
  match: (p: PermDef) => boolean;
}

const ROLES: RoleDef[] = [
  {
    code: 'SUPER_ADMIN',
    name: 'Super Admin',
    description: 'Full, unrestricted access to every module, page and action.',
    match: () => true,
  },
  {
    code: 'ADMIN',
    name: 'Admin',
    description: 'Operational administration of all modules except role management.',
    match: (p) =>
      !['roles.create', 'roles.edit', 'roles.delete', 'roles.assign_permissions'].includes(p.code),
  },
  {
    code: 'VIEWER',
    name: 'Viewer',
    description: 'Read-only access to operational pages (excludes user & role administration).',
    match: (p) => p.action === 'view' && p.module !== 'Access Control',
  },
];

async function main(): Promise<void> {
  const config = loadDatabaseConfig();
  const logger = createLogger({ serviceName: 'rbac-seed', level: 'info' });
  const client = new DatabaseClient({ config, logger });

  try {
    // 1. Upsert permission catalog.
    for (const p of PERMISSIONS) {
      await client.query(
        `INSERT INTO permissions (code, name, description, module, page, action)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description),
           module = VALUES(module), page = VALUES(page), action = VALUES(action)`,
        [p.code, p.name, p.description, p.module, p.page, p.action],
      );
    }
    logger.info(`Seeded ${PERMISSIONS.length} permissions.`);

    const permRows = await client.query<Array<{ id: number; code: string } & RowDataPacket>>(
      'SELECT id, code FROM permissions',
    );
    const permIdByCode = new Map(permRows.map((r) => [r.code, r.id]));

    // 2. Upsert roles + 3. link permissions.
    for (const role of ROLES) {
      await client.query(
        `INSERT INTO roles (code, name, description, is_system, organization_id)
         VALUES (?, ?, ?, 1, NULL)
         ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), is_system = 1`,
        [role.code, role.name, role.description],
      );
      const roleRow = await client.query<Array<{ id: number } & RowDataPacket>>(
        'SELECT id FROM roles WHERE code = ? LIMIT 1',
        [role.code],
      );
      const roleId = roleRow[0]!.id;

      const grantedIds = PERMISSIONS.filter(role.match)
        .map((p) => permIdByCode.get(p.code))
        .filter((id): id is number => typeof id === 'number');

      await client.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
      if (grantedIds.length > 0) {
        const values = grantedIds.map(() => '(?, ?)').join(', ');
        const params: unknown[] = [];
        for (const pid of grantedIds) params.push(roleId, pid);
        await client.query(
          `INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES ${values}`,
          params,
        );
      }
      logger.info(`Role ${role.code}: ${grantedIds.length} permissions.`);
    }

    // 4. Bootstrap super-admin user.
    const superRole = await client.query<Array<{ id: number } & RowDataPacket>>(
      "SELECT id FROM roles WHERE code = 'SUPER_ADMIN' LIMIT 1",
    );
    const superRoleId = superRole[0]!.id;

    const existing = await client.query<Array<{ id: number } & RowDataPacket>>(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [SUPERADMIN_EMAIL],
    );

    let userId: number;
    if (existing[0]) {
      userId = existing[0].id;
      logger.info(`Super-admin ${SUPERADMIN_EMAIL} already exists (id=${userId}); leaving password untouched.`);
    } else {
      const passwordHash = await hashPassword(SUPERADMIN_PASSWORD);
      const res = await client.query<ResultSetHeader>(
        `INSERT INTO users (organization_id, email, password_hash, full_name, status, must_change_password)
         VALUES (1, ?, ?, ?, 'ACTIVE', ?)`,
        [SUPERADMIN_EMAIL, passwordHash, SUPERADMIN_NAME, FORCE_PASSWORD_CHANGE ? 1 : 0],
      );
      userId = res.insertId;
      logger.info(`Created super-admin ${SUPERADMIN_EMAIL} (id=${userId}).`);
    }

    await client.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [
      userId,
      superRoleId,
    ]);

    logger.info('RBAC seed complete.');
    logger.info(`Login with: ${SUPERADMIN_EMAIL} (set SEED_SUPERADMIN_* env vars to change).`);
  } catch (error) {
    logger.error({ error }, 'RBAC seed failed');
    process.exit(1);
  } finally {
    await client.close();
  }
}

void main();
