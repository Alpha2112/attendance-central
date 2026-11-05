import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './decorators.js';
import { type AuthUser } from './auth.types.js';
import { AuditService } from '../audit/audit.service.js';

interface GuardReq {
  user?: AuthUser;
  method?: string;
  url?: string;
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}

/**
 * Global authorization guard. Runs after JwtAuthGuard. If a route declares
 * @RequirePermissions(...), the authenticated user must hold every listed
 * permission code; otherwise the request is forbidden and the denied attempt is
 * audited. Routes with no declaration only require authentication.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<GuardReq>();
    const user = req.user;
    if (!user) throw new ForbiddenException('Authentication required.');

    const missing = required.filter((p) => !user.permissions.includes(p));
    if (missing.length > 0) {
      const path = (req.url || '').split('?')[0];
      const h = req.headers || {};
      this.audit.record({
        actorType: 'USER',
        actorId: String(user.id),
        actorName: user.fullName,
        actorRole: user.roles?.[0] ?? null,
        action: 'UNAUTHORIZED_ACCESS',
        module: 'Authorization',
        description: `Denied ${req.method || ''} ${path} — missing permission: ${missing.join(', ')}.`,
        resourceType: 'auth',
        resourceId: missing.join(','),
        status: 'UNAUTHORIZED',
        ipAddress:
          req.ip ||
          (typeof h['x-forwarded-for'] === 'string'
            ? (h['x-forwarded-for'] as string).split(',')[0]?.trim()
            : null) ||
          null,
        userAgent: typeof h['user-agent'] === 'string' ? (h['user-agent'] as string) : null,
      });
      throw new ForbiddenException(`You lack the required permission: ${missing.join(', ')}.`);
    }
    return true;
  }
}
