import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RegistryService, type UpsertTenantDto } from './registry.service.js';

@ApiTags('Tenants')
@Controller(['tenants', 'api/v1/tenants'])
export class TenantsController {
  constructor(@Inject(RegistryService) private readonly registry: RegistryService) {}

  @Get()
  @ApiOperation({ summary: 'List all tenants (with organization counts)' })
  @ApiResponse({ status: 200, description: 'List of tenants' })
  public list() {
    return this.registry.listTenants();
  }

  @Post()
  @ApiOperation({ summary: 'Register a new tenant' })
  @ApiResponse({ status: 201, description: 'Tenant created' })
  @HttpCode(HttpStatus.CREATED)
  public create(@Body() dto: UpsertTenantDto) {
    return this.registry.createTenant(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a tenant' })
  public update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertTenantDto) {
    return this.registry.updateTenant(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a tenant (only if no organizations reference it)' })
  public async remove(@Param('id', ParseIntPipe) id: number) {
    await this.registry.deleteTenant(id);
    return { success: true };
  }
}
