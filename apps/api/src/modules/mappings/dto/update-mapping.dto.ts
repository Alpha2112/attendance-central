import { PartialType } from '@nestjs/swagger';
import { CreateMappingApiDto } from './create-mapping.dto.js';

export class UpdateMappingApiDto extends PartialType(CreateMappingApiDto) {}
