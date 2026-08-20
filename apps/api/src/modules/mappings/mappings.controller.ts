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
import { type DeviceEmployeeMappingWithDevice } from '@attendance/database';

@ApiTags('Biometric Identity Mappings')
@Controller(['mappings', 'api/v1/mappings'])
export class MappingsController {
  constructor(@Inject(MappingsService) private readonly mappingsService: MappingsService) {}

  @Get()
  @ApiOperation({ summary: 'List all biometric employee-to-device mappings' })
  @ApiQuery({ name: 'org', required: false, description: 'Organization code or numeric ID' })
  @ApiResponse({ status: 200, description: 'List of device employee mappings' })
  public async listMappings(
    @Query('org') org?: string,
  ): Promise<DeviceEmployeeMappingWithDevice[]> {
    return this.mappingsService.findAll(org);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get mapping details by numeric ID' })
  @ApiParam({ name: 'id', description: 'Mapping ID' })
  @ApiResponse({ status: 200, description: 'Mapping entity with terminal metadata' })
  public async getMapping(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<DeviceEmployeeMappingWithDevice> {
    return this.mappingsService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create or update an employee identity mapping' })
  @ApiResponse({ status: 201, description: 'Created/Updated mapping entity' })
  public async createMapping(
    @Body() dto: CreateMappingApiDto,
  ): Promise<DeviceEmployeeMappingWithDevice> {
    return this.mappingsService.create(dto);
  }

  @Patch(':id')
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
