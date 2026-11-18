import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller.js';
import { DevicesService } from './devices.service.js';
import { DeviceHealthMonitorRunner } from './device-health-monitor.runner.js';

@Module({
  controllers: [DevicesController],
  providers: [DevicesService, DeviceHealthMonitorRunner],
  exports: [DevicesService],
})
export class DevicesModule {}
