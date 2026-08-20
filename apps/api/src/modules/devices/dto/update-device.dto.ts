import { PartialType } from '@nestjs/swagger';
import { CreateDeviceApiDto } from './create-device.dto.js';

export class UpdateDeviceApiDto extends PartialType(CreateDeviceApiDto) {}
