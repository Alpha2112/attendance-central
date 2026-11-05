import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service.js';
import { RequirePermissions, CurrentUser } from '../auth/decorators.js';
import { type AuthUser } from '../auth/auth.types.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller(['users', 'api/v1/users'])
export class UsersController {
  constructor(@Inject(UsersService) private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions('users.view')
  @ApiOperation({ summary: 'List all users' })
  public list() {
    return this.usersService.list();
  }

  @Get(':id')
  @RequirePermissions('users.view')
  public getOne(@Param('id') id: string) {
    return this.usersService.getOne(Number(id));
  }

  @Post()
  @RequirePermissions('users.create')
  @ApiOperation({ summary: 'Create a user' })
  public create(
    @Body()
    dto: {
      email?: string;
      fullName?: string;
      password?: string;
      status?: string;
      roleIds?: number[];
    },
  ) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('users.edit')
  public update(
    @Param('id') id: string,
    @Body() dto: { email?: string; fullName?: string; status?: string; avatarUrl?: string | null },
  ) {
    return this.usersService.update(Number(id), dto);
  }

  @Patch(':id/status')
  @RequirePermissions('users.activate')
  public setStatus(
    @Param('id') id: string,
    @Body() dto: { active?: boolean },
    @CurrentUser() actor: AuthUser,
  ) {
    return this.usersService.setStatus(Number(id), dto?.active !== false, actor.id);
  }

  @Post(':id/reset-password')
  @RequirePermissions('users.reset_password')
  @HttpCode(HttpStatus.OK)
  public resetPassword(@Param('id') id: string, @Body() dto: { newPassword?: string }) {
    return this.usersService.resetPassword(Number(id), dto?.newPassword);
  }

  @Patch(':id/roles')
  @RequirePermissions('users.assign_roles')
  public assignRoles(@Param('id') id: string, @Body() dto: { roleIds?: number[] }) {
    return this.usersService.assignRoles(Number(id), dto?.roleIds ?? []);
  }

  @Delete(':id')
  @RequirePermissions('users.delete')
  public remove(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.usersService.remove(Number(id), actor.id);
  }
}
