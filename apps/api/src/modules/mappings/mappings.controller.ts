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
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { MappingsService } from './mappings.service.js';
import { CreateMappingApiDto } from './dto/create-mapping.dto.js';
import { UpdateMappingApiDto } from './dto/update-mapping.dto.js';
import {
  BulkValidateDto,
  BulkImportDto,
  type BulkValidateResult,
  type BulkImportResult,
} from './dto/bulk-mapping.dto.js';
import { type DeviceEmployeeMappingWithDevice } from '@attendance/database';
import { RequirePermissions } from '../auth/decorators.js';

@ApiTags('Biometric Identity Mappings')
@Controller(['mappings', 'api/v1/mappings'])
export class MappingsController {
  constructor(@Inject(MappingsService) private readonly mappingsService: MappingsService) {}

  @Get()
  @RequirePermissions('mappings.view')
  @ApiOperation({ summary: 'List all biometric employee-to-device mappings' })
  @ApiQuery({ name: 'org', required: false, description: 'Organization code or numeric ID' })
  @ApiResponse({ status: 200, description: 'List of device employee mappings' })
  public async listMappings(
    @Query('org') org?: string,
  ): Promise<DeviceEmployeeMappingWithDevice[]> {
    return this.mappingsService.findAll(org);
  }

  @Get(':id')
  @RequirePermissions('mappings.view')
  @ApiOperation({ summary: 'Get mapping details by numeric ID' })
  @ApiParam({ name: 'id', description: 'Mapping ID' })
  @ApiResponse({ status: 200, description: 'Mapping entity with terminal metadata' })
  public async getMapping(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<DeviceEmployeeMappingWithDevice> {
    return this.mappingsService.findById(id);
  }

  @Post()
  @RequirePermissions('mappings.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create or update an employee identity mapping' })
  @ApiResponse({ status: 201, description: 'Created/Updated mapping entity' })
  public async createMapping(
    @Body() dto: CreateMappingApiDto,
  ): Promise<DeviceEmployeeMappingWithDevice> {
    return this.mappingsService.create(dto);
  }

  @Post('bulk/validate')
  @RequirePermissions('mappings.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate a batch of employee mappings without writing' })
  @ApiResponse({ status: 200, description: 'Per-row validation and summary' })
  public async validateBulk(@Body() dto: BulkValidateDto): Promise<BulkValidateResult> {
    return this.mappingsService.validateBulk(dto?.rows ?? [], dto?.defaults);
  }

  @Post('bulk/import')
  @RequirePermissions('mappings.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Import a validated batch of employee mappings (idempotent upsert)' })
  @ApiResponse({ status: 200, description: 'Per-row import results and summary' })
  public async importBulk(@Body() dto: BulkImportDto): Promise<BulkImportResult> {
    return this.mappingsService.importBulk(dto?.rows ?? [], dto?.defaults);
  }

  @Patch(':id')
  @RequirePermissions('mappings.edit')
  @ApiOperation({ summary: 'Update an existing employee identity mapping' })
  @ApiParam({ name: 'id', description: 'Mapping ID' })
  @ApiResponse({ status: 200, description: 'Updated mapping entity' })
  public async updateMapping(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMappingApiDto,
  ): Promise<DeviceEmployeeMappingWithDevice> {
    return this.mappingsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('mappings.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete / Unmap an employee from a device' })
  @ApiParam({ name: 'id', description: 'Mapping ID' })
  @ApiResponse({ status: 200, description: 'Mapping successfully deleted' })
  public async deleteMapping(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ success: boolean; id: number }> {
    await this.mappingsService.delete(id);
    return { success: true, id };
  }
}
