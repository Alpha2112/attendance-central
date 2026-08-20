import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDeviceApiDto {
  @ApiProperty({ example: 'DEV-HQ-HIK01', description: 'Unique device code' })
  deviceCode!: string;

  @ApiProperty({
    example: 'HQ Turnstile 02 (Exit Face Term)',
    description: 'Human-readable terminal name',
  })
  name!: string;

  @ApiProperty({ example: 'HIKVISION', enum: ['HIKVISION', 'ZKTECO', 'SUPREMA', 'DAHUA', 'ANVIZ'] })
  vendor!: string;

  @ApiPropertyOptional({ example: 'DS-K1T321MFWX', description: 'Hardware model' })
  model?: string;

  @ApiPropertyOptional({ example: '192.168.100.186', description: 'Terminal IP or hostname' })
  host?: string;

  @ApiPropertyOptional({ example: 80, description: 'Communication port' })
  port?: number;

  @ApiPropertyOptional({ example: 'ISAPI', description: 'Communication protocol' })
  protocol?: string;

  @ApiPropertyOptional({ example: 'PUSH', enum: ['PUSH', 'PULL', 'HYBRID', 'REALTIME'] })
  connectionMode?: 'PUSH' | 'PULL' | 'HYBRID';

  @ApiPropertyOptional({ example: 'admin', description: 'Device admin username' })
  username?: string;

  @ApiPropertyOptional({ example: 'uno@6488', description: 'Device admin password or commKey' })
  password?: string;

  @ApiPropertyOptional({ example: false, description: 'Whether to connect via HTTPS' })
  useHttps?: boolean;

  @ApiPropertyOptional({ example: 'ORG-TECHIVE', description: 'Organization code or ID' })
  organizationId?: string | number;

  @ApiPropertyOptional({ example: 'UTC', description: 'Device local timezone' })
  timezone?: string;

  @ApiPropertyOptional({ example: 'ACTIVE', description: 'Initial device status' })
  status?: string;
}
