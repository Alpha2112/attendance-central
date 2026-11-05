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
import { RolesService } from './roles.service.js';
import { RequirePermissions } from '../auth/decorators.js';

@ApiTags('roles')
@ApiBearerAuth()
@Controller(['roles', 'api/v1/roles'])
export class RolesController {
  constructor(@Inject(RolesService) private readonly rolesService: RolesService) {}

  // Permission catalog (for the role editor). Placed before :id to avoid clashing.
  @Get('permissions/catalog')
  @RequirePermissions('permissions.view')
  @ApiOperation({ summary: 'List the full permission catalog' })
  public catalog() {
    return this.rolesService.listPermissions();
  }

  @Get()
  @RequirePermissions('roles.view')
  public list() {
    return this.rolesService.list();
  }

  @Get(':id')
  @RequirePermissions('roles.view')
  public getOne(@Param('id') id: string) {
    return this.rolesService.getOne(Number(id));
  }

  @Post()
  @RequirePermissions('roles.create')
  public create(
    @Body()
    dto: { code?: string; name?: string; description?: string | null; permissionIds?: number[] },
  ) {
    return this.rolesService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('roles.edit')
  public update(
    @Param('id') id: string,
    @Body() dto: { name?: string; description?: string | null },
  ) {
    return this.rolesService.update(Number(id), dto);
  }

  @Patch(':id/permissions')
  @RequirePermissions('roles.assign_permissions')
  public setPermissions(@Param('id') id: string, @Body() dto: { permissionIds?: number[] }) {
    return this.rolesService.setPermissions(Number(id), dto?.permissionIds ?? []);
  }

  @Delete(':id')
  @RequirePermissions('roles.delete')
  @HttpCode(HttpStatus.OK)
  public remove(@Param('id') id: string) {
    return this.rolesService.remove(Number(id));
  }
}
