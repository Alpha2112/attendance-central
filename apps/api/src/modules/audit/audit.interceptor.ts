import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { randomUUID } from 'node:crypto';
import { AuditService } from './audit.service.js';
import { type AuthUser } from '../auth/auth.types.js';

interface ReqLike {
  method: string;
  url?: string;
  originalUrl?: string;
  routerPath?: string;
  params?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  user?: AuthUser;
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const RESOURCE_MODULE: Record<string, string> = {
  users: 'Users',
  roles: 'Roles',
  devices: 'Device Registry',
  mappings: 'Identity Mappings',
  integrations: 'Integrations',
  organizations: 'Organizations',
  tenants: 'Tenants',
  punches: 'Punches',
};
const SINGULAR: Record<string, string> = {
  users: 'USER',
  roles: 'ROLE',
  devices: 'DEVICE',
  mappings: 'MAPPING',
  integrations: 'INTEGRATION',
  organizations: 'ORGANIZATION',
  tenants: 'TENANT',
  punches: 'PUNCH',
};
const SUB_ACTION: Record<string, string> = {
  status: 'SET_STATUS',
  roles: 'ASSIGN_ROLES',
  permissions: 'SET_PERMISSIONS',
  'reset-password': 'RESET_PASSWORD',
  test: 'TEST',
  probe: 'PROBE',
  sync: 'SYNC',
  reemit: 'REEMIT',
  purge: 'PURGE',
};
// These are handled explicitly elsewhere (AuthService) or are public machine hooks.
const SKIP_RESOURCES = new Set(['auth', 'health', 'audit-logs']);

/**
 * Global interceptor that records an audit entry for every authenticated
 * mutating request. It observes the response stream with `tap` (success + error)
 * and never alters or blocks it — logging is fire-and-forget, so it cannot break
 * or slow the operation being audited.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<ReqLike>();
    const method = (req.method || '').toUpperCase();

    if (!MUTATING.has(method) || !req.user) {
      return next.handle();
    }

    const rawPath = (req.url || req.originalUrl || req.routerPath || '').split('?')[0] ?? '';
    const segments = rawPath.replace(/^\/+(api\/v1\/)?/, '').split('/').filter(Boolean);
    const resource = segments[0] || '';
    if (SKIP_RESOURCES.has(resource) || !resource) {
      return next.handle();
    }

    const meta = this.describe(method, segments);
    const correlationId =
      (typeof req.headers?.['x-correlation-id'] === 'string'
        ? (req.headers['x-correlation-id'] as string)
        : undefined) || randomUUID();
    const ip =
      req.ip ||
      (typeof req.headers?.['x-forwarded-for'] === 'string'
        ? (req.headers['x-forwarded-for'] as string).split(',')[0]?.trim()
        : undefined) ||
      null;
    const userAgent =
      typeof req.headers?.['user-agent'] === 'string' ? req.headers['user-agent'] : null;
    const user = req.user as AuthUser;
    const submitted = method === 'DELETE' ? undefined : req.body;

    const base = {
      organizationId: 1,
      actorType: 'USER',
      actorId: String(user.id),
      actorName: user.fullName || user.email,
      actorRole: user.roles?.[0] ?? null,
      action: meta.action,
      module: meta.module,
      resourceType: resource,
      ipAddress: ip,
      userAgent,
      correlationId,
      afterState: submitted,
    };

    return next.handle().pipe(
      tap({
        next: (data) => {
          const resId = this.resolveId(segments, data);
          this.audit.record({
            ...base,
            resourceId: resId,
            description: `${meta.action} on ${meta.module}${resId && resId !== '-' ? ` #${resId}` : ''}`,
            status: 'SUCCESS',
          });
        },
        error: () => {
          const resId = this.resolveId(segments, undefined);
          this.audit.record({
            ...base,
            resourceId: resId,
            description: `${meta.action} on ${meta.module} failed`,
            status: 'FAILED',
          });
        },
      }),
    );
  }

  private describe(method: string, segments: string[]): { action: string; module: string } {
    const resource = segments[0] || '';
    const sub = segments[2];
    const singular = SINGULAR[resource] || resource.toUpperCase();
    const module = RESOURCE_MODULE[resource] || resource;
    let action: string;
    if (sub && SUB_ACTION[sub]) {
      action = `${SUB_ACTION[sub]}_${singular}`;
    } else if (sub) {
      action = `${sub.toUpperCase().replace(/-/g, '_')}_${singular}`;
    } else {
      const verb = method === 'POST' ? 'CREATE' : method === 'DELETE' ? 'DELETE' : 'UPDATE';
      action = `${verb}_${singular}`;
    }
    return { action, module };
  }

  private resolveId(segments: string[], data: unknown): string {
    const idPart = segments[1];
    if (idPart && !SUB_ACTION[idPart]) return idPart;
    if (data && typeof data === 'object' && 'id' in data) {
      return String((data as { id: unknown }).id ?? '-');
    }
    return '-';
  }
}
