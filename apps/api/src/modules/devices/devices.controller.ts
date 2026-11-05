import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DevicesService, type DeviceProbeResult } from './devices.service.js';
import { CreateDeviceApiDto } from './dto/create-device.dto.js';
import { UpdateDeviceApiDto } from './dto/update-device.dto.js';
import { type DeviceEntity } from '@attendance/database';
import { RequirePermissions } from '../auth/decorators.js';

@ApiTags('Device Fleet Management')
@Controller(['devices', 'api/v1/devices'])
export class DevicesController {
  constructor(@Inject(DevicesService) private readonly devicesService: DevicesService) {}

  @Get()
  @RequirePermissions('devices.view')
  @ApiOperation({ summary: 'List all registered hardware devices' })
  @ApiResponse({ status: 200, description: 'List of devices in fleet' })
  async findAll(): Promise<DeviceEntity[]> {
    return this.devicesService.findAll();
  }

  @Get(':id')
  @RequirePermissions('devices.view')
  @ApiOperation({ summary: 'Get device by ID' })
  @ApiResponse({ status: 200, description: 'Device details' })
  @ApiResponse({ status: 404, description: 'Device not found' })
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<DeviceEntity> {
    return this.devicesService.findById(id);
  }

  @Post()
  @RequirePermissions('devices.create')
  @ApiOperation({ summary: 'Register a new hardware biometric device' })
  @ApiResponse({ status: 201, description: 'Device successfully registered' })
  async create(@Body() dto: CreateDeviceApiDto): Promise<DeviceEntity> {
    return this.devicesService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('devices.edit')
  @ApiOperation({ summary: 'Update device parameters or credentials' })
  @ApiResponse({ status: 200, description: 'Device updated successfully' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDeviceApiDto,
  ): Promise<DeviceEntity> {
    return this.devicesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('devices.delete')
  @ApiOperation({ summary: 'Deregister/remove a device' })
  @ApiResponse({ status: 200, description: 'Device deleted' })
  async delete(@Param('id', ParseIntPipe) id: number): Promise<{ success: boolean }> {
    await this.devicesService.delete(id);
    return { success: true };
  }

  @Post('probe')
  @RequirePermissions('devices.test')
  @ApiOperation({ summary: 'Live connection probe test with dynamic credentials' })
  @ApiResponse({ status: 200, description: 'Probe result' })
  async probeDynamic(@Body() dto: CreateDeviceApiDto): Promise<DeviceProbeResult> {
    return this.devicesService.probeDevice(dto);
  }

  @Post(':id/probe')
  @RequirePermissions('devices.test')
  @ApiOperation({ summary: 'Live connection probe test for a registered device' })
  @ApiResponse({ status: 200, description: 'Probe result and updated status' })
  async probeRegistered(@Param('id', ParseIntPipe) id: number): Promise<DeviceProbeResult> {
    return this.devicesService.probeDevice(id);
  }
}
