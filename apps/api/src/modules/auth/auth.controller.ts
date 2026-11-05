import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService, type AuthContext } from './auth.service.js';
import { LoginDto, ChangePasswordDto } from './dto/auth.dto.js';
import { Public, CurrentUser } from './decorators.js';
import { type AuthUser } from './auth.types.js';

interface ReqLike {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}

function ctxFrom(req: ReqLike): AuthContext {
  const h = req.headers || {};
  const xff = typeof h['x-forwarded-for'] === 'string' ? (h['x-forwarded-for'] as string) : '';
  return {
    ip: req.ip || (xff ? xff.split(',')[0]?.trim() : null) || null,
    userAgent: typeof h['user-agent'] === 'string' ? (h['user-agent'] as string) : null,
    correlationId: typeof h['x-correlation-id'] === 'string' ? (h['x-correlation-id'] as string) : null,
  };
}

@ApiTags('auth')
@Controller(['auth', 'api/v1/auth'])
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate and receive a JWT' })
  @ApiResponse({ status: 200, description: 'Login succeeded' })
  public async login(@Body() dto: LoginDto, @Req() req: ReqLike) {
    if (!dto?.email || !dto?.password) {
      throw new BadRequestException('Email and password are required.');
    }
    return this.authService.login(dto.email, dto.password, ctxFrom(req));
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current authenticated user, roles and permissions' })
  public me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Post('logout')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record sign-out for the current user' })
  public logout(@CurrentUser() user: AuthUser, @Req() req: ReqLike) {
    this.authService.logout(user, ctxFrom(req));
    return { success: true };
  }

  @Post('change-password')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change the current user password' })
  public async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: ReqLike,
  ) {
    if (!dto?.currentPassword || !dto?.newPassword) {
      throw new BadRequestException('Current and new password are required.');
    }
    await this.authService.changePassword(user.id, dto.currentPassword, dto.newPassword, ctxFrom(req));
    return { success: true };
  }
}
