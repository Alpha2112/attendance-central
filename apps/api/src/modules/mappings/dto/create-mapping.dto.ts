import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMappingApiDto {
  @ApiProperty({ example: 'EMP-1001', description: 'HRMS external employee identifier' })
  externalEmployeeId!: string;

  @ApiPropertyOptional({ example: 'Sarah Jenkins', description: 'Employee full name' })
  employeeName?: string;

  @ApiPropertyOptional({ example: 'Engineering', description: 'Department or business unit' })
  department?: string;

  @ApiPropertyOptional({ example: 57, description: 'Numeric Device ID in platform' })
  deviceId?: number;

  @ApiPropertyOptional({ example: 'DEV-HQ-HIK01', description: 'Hardware device code' })
  deviceCode?: string;

  @ApiProperty({ example: '1001', description: 'Biometric vendor user ID on terminal' })
  vendorUserId!: string;

  @ApiPropertyOptional({ example: '1001', description: 'Vendor employee code on terminal' })
  vendorEmployeeCode?: string;

  @ApiPropertyOptional({ example: 'CRD-88910', description: 'RFID card or badge tag number' })
  cardNo?: string;

  @ApiPropertyOptional({ example: 'ACTIVE', enum: ['ACTIVE', 'INACTIVE'] })
  status?: string;

  @ApiPropertyOptional({ example: 'ORG-TECHIVE', description: 'Organization code or ID' })
  organizationId?: string | number;
}
