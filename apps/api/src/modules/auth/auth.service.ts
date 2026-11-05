import {
  Injectable,
  Inject,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  DatabaseClient,
  UserRepository,
  hashPassword,
  verifyPassword,
} from '@attendance/database';
import type { AppConfig } from '@attendance/config';
import { CONFIG_TOKEN } from '../config/config.module.js';
import { signJwt, verifyJwt } from './jwt.util.js';
import { type AuthUser } from './auth.types.js';
import { AuditService } from '../audit/audit.service.js';

export interface AuthContext {
  ip?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
}

@Injectable()
export class AuthService {
  private readonly users: UserRepository;

  constructor(
    @Inject(DatabaseClient) private readonly db: DatabaseClient,
    @Inject(CONFIG_TOKEN) private readonly config: AppConfig,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {
    this.users = new UserRepository(this.db);
  }

  /** Validates credentials and returns a signed JWT plus the resolved principal. */
  public async login(
    email: string,
    password: string,
    ctx: AuthContext = {},
  ): Promise<{ token: string; expiresIn: number; user: AuthUser }> {
    const normalizedEmail = (email || '').trim().toLowerCase();
    const user = await this.users.findByEmail(normalizedEmail);
    // Always run a verification to reduce user-enumeration timing differences.
    const ok = user ? await verifyPassword(password, user.password_hash) : false;
    if (!user || !ok) {
      this.audit.record({
        actorType: user ? 'USER' : 'ANONYMOUS',
        actorId: user ? String(user.id) : normalizedEmail || 'unknown',
        actorName: user ? user.full_name : normalizedEmail,
        action: 'LOGIN_FAILED',
        module: 'Authentication',
        description: `Failed login attempt for "${normalizedEmail}".`,
        resourceType: 'auth',
        status: 'FAILED',
        ipAddress: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        correlationId: ctx.correlationId ?? null,
      });
      throw new UnauthorizedException('Invalid email or password.');
    }
    if (String(user.status).toUpperCase() !== 'ACTIVE') {
      this.audit.record({
        actorType: 'USER',
        actorId: String(user.id),
        actorName: user.full_name,
        action: 'LOGIN_BLOCKED',
        module: 'Authentication',
        description: `Login blocked — account "${normalizedEmail}" is deactivated.`,
        resourceType: 'auth',
        status: 'UNAUTHORIZED',
        ipAddress: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        correlationId: ctx.correlationId ?? null,
      });
      throw new ForbiddenException('This account is deactivated. Contact an administrator.');
    }

    await this.users.touchLastLogin(user.id);
    const token = signJwt(
      { sub: user.id, email: user.email },
      this.config.JWT_SECRET,
      this.config.JWT_EXPIRES_IN_SECONDS,
    );
    const authUser = await this.loadAuthUser(user.id);
    if (!authUser) throw new UnauthorizedException('Account could not be loaded.');
    this.audit.record({
      actorType: 'USER',
      actorId: String(user.id),
      actorName: authUser.fullName,
      actorRole: authUser.roles[0] ?? null,
      action: 'LOGIN',
      module: 'Authentication',
      description: `User "${authUser.email}" signed in.`,
      resourceType: 'auth',
      status: 'SUCCESS',
      ipAddress: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      correlationId: ctx.correlationId ?? null,
    });
    return { token, expiresIn: this.config.JWT_EXPIRES_IN_SECONDS, user: authUser };
  }

  /** Records a sign-out event (the token itself is discarded client-side). */
  public logout(user: AuthUser, ctx: AuthContext = {}): void {
    this.audit.record({
      actorType: 'USER',
      actorId: String(user.id),
      actorName: user.fullName,
      actorRole: user.roles[0] ?? null,
      action: 'LOGOUT',
      module: 'Authentication',
      description: `User "${user.email}" signed out.`,
      resourceType: 'auth',
      status: 'SUCCESS',
      ipAddress: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      correlationId: ctx.correlationId ?? null,
    });
  }

  /** Verifies a bearer token and loads the fresh principal (roles/permissions live). */
  public async authenticate(token: string): Promise<AuthUser | null> {
    const payload = verifyJwt(token, this.config.JWT_SECRET);
    if (!payload) return null;
    return this.loadAuthUser(payload.sub);
  }

  /** Builds the AuthUser (roles + permissions) from the database. */
  public async loadAuthUser(userId: number): Promise<AuthUser | null> {
    const user = await this.users.findById(userId);
    if (!user) return null;
    if (String(user.status).toUpperCase() !== 'ACTIVE') return null;
    const [roles, permissions] = await Promise.all([
      this.users.getRoles(userId),
      this.users.getPermissionCodes(userId),
    ]);
    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      status: user.status,
      mustChangePassword: user.must_change_password === 1,
      roles: roles.map((r) => r.code),
      permissions,
    };
  }

  public async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
    ctx: AuthContext = {},
  ): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('Account not found.');
    const ok = await verifyPassword(currentPassword, user.password_hash);
    if (!ok) {
      this.audit.record({
        actorType: 'USER',
        actorId: String(userId),
        actorName: user.full_name,
        action: 'CHANGE_PASSWORD',
        module: 'Authentication',
        description: 'Password change failed — current password incorrect.',
        resourceType: 'user',
        resourceId: String(userId),
        status: 'FAILED',
        ipAddress: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        correlationId: ctx.correlationId ?? null,
      });
      throw new BadRequestException('Current password is incorrect.');
    }
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters.');
    }
    const passwordHash = await hashPassword(newPassword);
    await this.users.update(userId, { passwordHash, mustChangePassword: false });
    this.audit.record({
      actorType: 'USER',
      actorId: String(userId),
      actorName: user.full_name,
      action: 'CHANGE_PASSWORD',
      module: 'Authentication',
      description: 'User changed their password.',
      resourceType: 'user',
      resourceId: String(userId),
      status: 'SUCCESS',
      ipAddress: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      correlationId: ctx.correlationId ?? null,
    });
  }
}
