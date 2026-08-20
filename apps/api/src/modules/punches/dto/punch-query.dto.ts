import { ApiPropertyOptional } from '@nestjs/swagger';

export class PunchQueryDto {
  @ApiPropertyOptional({ example: 'ORG-TECHIVE', description: 'Organization code or ID' })
  organizationId?: string | number;

  @ApiPropertyOptional({ example: 'EMP-1001', description: 'Filter by external employee ID' })
  employeeId?: string;

  @ApiPropertyOptional({ example: 57, description: 'Filter by numeric device ID' })
  deviceId?: number;

  @ApiPropertyOptional({ example: 'DEV-HQ-HIK01', description: 'Filter by device code' })
  deviceCode?: string;

  @ApiPropertyOptional({ example: '2026-08-18', description: 'Filter by event date (YYYY-MM-DD)' })
  date?: string;

  @ApiPropertyOptional({ description: 'Search term for employee name, ID, or fingerprint' })
  search?: string;

  @ApiPropertyOptional({ example: 50, description: 'Max items to return' })
  limit?: number;

  @ApiPropertyOptional({ description: 'Cursor timestamp for pagination' })
  cursorTime?: string;

  @ApiPropertyOptional({ description: 'Cursor ID for pagination' })
  cursorId?: number;
}

export class IngestPunchDto {
  @ApiPropertyOptional({ example: 'ORG-TECHIVE' })
  organizationId?: string | number;

  @ApiPropertyOptional({ example: 'DEV-HQ-HIK01' })
  deviceCode?: string;

  @ApiPropertyOptional({ example: 57 })
  deviceId?: number;

  @ApiPropertyOptional({ example: 'EMP-1001' })
  employeeId?: string;

  @ApiPropertyOptional({ example: '1001' })
  vendorUserId?: string;

  @ApiPropertyOptional({ example: 'IN', enum: ['IN', 'OUT', 'BREAK_OUT', 'BREAK_IN'] })
  punchType?: 'IN' | 'OUT' | 'BREAK_OUT' | 'BREAK_IN';

  @ApiPropertyOptional({ example: 'FACE', enum: ['FACE', 'FINGERPRINT', 'CARD', 'PIN', 'QR'] })
  verificationType?: 'FACE' | 'FINGERPRINT' | 'CARD' | 'PIN' | 'QR';

  @ApiPropertyOptional({ example: 'CRD-88910' })
  cardNo?: string;

  @ApiPropertyOptional({ example: 'PUSH', enum: ['PUSH', 'PULL', 'REALTIME'] })
  source?: 'PUSH' | 'PULL' | 'REALTIME';
}
