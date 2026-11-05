import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service.js';
import { IS_PUBLIC_KEY } from './decorators.js';
import { type AuthUser } from './auth.types.js';

/**
 * Global authentication guard. Verifies the Bearer JWT, loads the fresh principal
 * (roles + permissions straight from the DB, so changes take effect immediately),
 * and attaches it as request.user. Routes marked @Public() bypass this.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; user?: AuthUser }>();
    const header = req.headers['authorization'] || req.headers['Authorization'];
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authentication required.');
    }
    const token = header.slice('Bearer '.length).trim();
    const user = await this.authService.authenticate(token);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired session. Please sign in again.');
    }
    req.user = user;
    return true;
  }
}
