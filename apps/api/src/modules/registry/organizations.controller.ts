import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { RegistryService, type UpsertOrganizationDto } from './registry.service.js';

@ApiTags('Organizations')
@Controller(['organizations', 'api/v1/organizations'])
export class OrganizationsController {
  constructor(@Inject(RegistryService) private readonly registry: RegistryService) {}

  @Get()
  @ApiOperation({ summary: 'List organizations, optionally filtered by tenant' })
  @ApiQuery({ name: 'tenantId', required: false, description: 'Filter to one tenant' })
  @ApiResponse({ status: 200, description: 'List of organizations' })
  public list(@Query('tenantId') tenantId?: string) {
    const parsed = tenantId !== undefined && tenantId !== '' ? Number(tenantId) : undefined;
    return this.registry.listOrganizations(
      parsed !== undefined && !Number.isNaN(parsed) ? parsed : undefined,
    );
  }

  @Post()
  @ApiOperation({ summary: 'Register a new organization' })
  @ApiResponse({ status: 201, description: 'Organization created' })
  @HttpCode(HttpStatus.CREATED)
  public create(@Body() dto: UpsertOrganizationDto) {
    return this.registry.createOrganization(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an organization' })
  public update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertOrganizationDto) {
    return this.registry.updateOrganization(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an organization' })
  public async remove(@Param('id', ParseIntPipe) id: number) {
    await this.registry.deleteOrganization(id);
    return { success: true };
  }
}
