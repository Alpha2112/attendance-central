import { Injectable, Inject } from '@nestjs/common';
import { DatabaseClient } from '@attendance/database';
import type { AppLogger } from '@attendance/logging';
import { LOGGER_TOKEN } from '../logging/logging.module.js';

export interface AuditEntry {
  organizationId?: number;
  actorType: string; // USER | SYSTEM | ANONYMOUS
  actorId: string; // user id or email or 'anonymous'
  actorName?: string | null;
  actorRole?: string | null;
  action: string; // e.g. LOGIN, CREATE_USER
  module?: string | null; // e.g. Users, Devices
  description?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
  status?: 'SUCCESS' | 'FAILED' | 'WARNING' | 'UNAUTHORIZED';
}

export interface AuditQuery {
  search?: string; // actor id/name
  action?: string;
  module?: string;
  status?: string;
  role?: string;
  ip?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

const SENSITIVE_RE = /pass(word)?|secret|token|hash|signing|credential|authorization|cookie/i;

/** Recursively strips sensitive keys so secrets never land in the audit trail. */
function sanitize(value: unknown, depth = 0): unknown {
  if (value == null || depth > 4) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_RE.test(k)) out[k] = '[redacted]';
      else out[k] = sanitize(v, depth + 1);
    }
    return out;
  }
  return value;
}

@Injectable()
export class AuditService {
  constructor(
    @Inject(DatabaseClient) private readonly db: DatabaseClient,
    @Inject(LOGGER_TOKEN) private readonly logger: AppLogger,
  ) {}

  /**
   * Records an audit entry. Best-effort and non-blocking: it never throws, so a
   * logging failure can never break the operation being audited.
   */
  public record(entry: AuditEntry): void {
    void this.write(entry).catch((err) => {
      this.logger?.warn?.(
        { error: err instanceof Error ? err.message : String(err), action: entry.action },
        'Audit log write failed (non-fatal)',
      );
    });
  }

  private async write(entry: AuditEntry): Promise<void> {
    const before = entry.beforeState !== undefined ? JSON.stringify(sanitize(entry.beforeState)) : null;
    const after = entry.afterState !== undefined ? JSON.stringify(sanitize(entry.afterState)) : null;
    await this.db.query(
      `INSERT INTO audit_logs (
        tenant_id, organization_id, actor_type, actor_id, actor_name, actor_role,
        action, module, description, resource_type, resource_id,
        before_state, after_state, ip_address, user_agent, correlation_id, status
      ) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.organizationId ?? 1,
        entry.actorType,
        String(entry.actorId ?? 'unknown').slice(0, 100),
        entry.actorName ?? null,
        entry.actorRole ?? null,
        entry.action,
        entry.module ?? null,
        entry.description ?? null,
        entry.resourceType ?? '-',
        String(entry.resourceId ?? '-').slice(0, 100),
        before,
        after,
        entry.ipAddress ?? null,
        entry.userAgent ? String(entry.userAgent).slice(0, 500) : null,
        entry.correlationId ?? null,
        entry.status ?? 'SUCCESS',
      ],
    );
  }

  /** Filtered, paginated audit log read. */
  public async query(q: AuditQuery): Promise<{
    items: unknown[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (q.search) {
      conditions.push('(actor_id LIKE ? OR actor_name LIKE ?)');
      const s = `%${q.search.trim()}%`;
      params.push(s, s);
    }
    if (q.action) {
      conditions.push('action = ?');
      params.push(q.action);
    }
    if (q.module) {
      conditions.push('module = ?');
      params.push(q.module);
    }
    if (q.status) {
      conditions.push('status = ?');
      params.push(q.status);
    }
    if (q.role) {
      conditions.push('actor_role = ?');
      params.push(q.role);
    }
    if (q.ip) {
      conditions.push('ip_address LIKE ?');
      params.push(`%${q.ip.trim()}%`);
    }
    if (q.dateFrom) {
      conditions.push('created_at >= ?');
      params.push(q.dateFrom);
    }
    if (q.dateTo) {
      conditions.push('created_at <= ?');
      params.push(q.dateTo);
    }

    const where = conditions.join(' AND ');
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(q.pageSize) || 25));
    const offset = (page - 1) * pageSize;
    const order = q.sort === 'asc' ? 'ASC' : 'DESC';

    const countRows = (await this.db.query(
      `SELECT COUNT(*) AS n FROM audit_logs WHERE ${where}`,
      params,
    )) as Array<{ n: number }>;
    const total = Number(countRows[0]?.n ?? 0);

    const rows = (await this.db.query(
      `SELECT id, actor_type, actor_id, actor_name, actor_role, action, module, description,
              resource_type, resource_id, before_state, after_state, ip_address, user_agent,
              correlation_id, status, created_at
       FROM audit_logs WHERE ${where}
       ORDER BY id ${order}
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    )) as Array<Record<string, unknown>>;

    return { items: rows.map((r) => this.toView(r)), total, page, pageSize };
  }

  public async getOne(id: number): Promise<unknown | null> {
    const rows = (await this.db.query(`SELECT * FROM audit_logs WHERE id = ? LIMIT 1`, [
      id,
    ])) as Array<Record<string, unknown>>;
    return rows[0] ? this.toView(rows[0]) : null;
  }

  /** Distinct values for filter dropdowns (actions, modules, roles). */
  public async facets(): Promise<{ actions: string[]; modules: string[]; roles: string[] }> {
    const pluck = async (col: string): Promise<string[]> => {
      try {
        const rows = (await this.db.query(
          `SELECT DISTINCT ${col} AS v FROM audit_logs WHERE ${col} IS NOT NULL ORDER BY ${col} ASC LIMIT 200`,
        )) as Array<{ v: string }>;
        return rows.map((r) => r.v).filter(Boolean);
      } catch {
        return [];
      }
    };
    const [actions, modules, roles] = await Promise.all([
      pluck('action'),
      pluck('module'),
      pluck('actor_role'),
    ]);
    return { actions, modules, roles };
  }

  private toView(r: Record<string, unknown>): Record<string, unknown> {
    const parse = (v: unknown): unknown => {
      if (v == null) return null;
      if (typeof v === 'string') {
        try {
          return JSON.parse(v);
        } catch {
          return v;
        }
      }
      return v;
    };
    return {
      id: r.id,
      actorType: r.actor_type,
      actorId: r.actor_id,
      actorName: r.actor_name,
      actorRole: r.actor_role,
      action: r.action,
      module: r.module,
      description: r.description,
      resourceType: r.resource_type,
      resourceId: r.resource_id,
      beforeState: parse(r.before_state),
      afterState: parse(r.after_state),
      ipAddress: r.ip_address,
      userAgent: r.user_agent,
      correlationId: r.correlation_id,
      status: r.status,
      createdAt: r.created_at ? new Date(r.created_at as string).toISOString() : null,
    };
  }
}
