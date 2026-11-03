import { ApiPropertyOptional } from '@nestjs/swagger';

/** All fields optional: only the provided fields are updated. */
export class UpdateIntegrationDto {
  @ApiPropertyOptional({ example: 'Workday HRMS Primary Webhook' })
  name?: string;

  @ApiPropertyOptional({ enum: ['HRMS_WEBHOOK', 'ERP_SYNC', 'WEBHOOK', 'CUSTOM'] })
  targetType?: string;

  @ApiPropertyOptional({ example: 'https://hrms.example.com/api/v1/attendance/events' })
  endpointUrl?: string;

  @ApiPropertyOptional({ example: 'ORG-TECHIVE', description: 'Organization id injected into delivered payloads (blank = event org).' })
  organizationId?: string;

  @ApiPropertyOptional({ example: 'TENANT-XYZ', description: 'Tenant id injected into delivered payloads (blank = omitted).' })
  tenantId?: string;

  @ApiPropertyOptional({ enum: ['HMAC_SHA256', 'ED25519', 'NONE'] })
  authType?: string;

  @ApiPropertyOptional({ example: 'attendance.normalized.v1' })
  eventTypes?: string;

  @ApiPropertyOptional({ example: 5 })
  retryLimit?: number;

  @ApiPropertyOptional({ example: 10000 })
  timeoutMs?: number;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'PAUSED', 'DISABLED'] })
  status?: string;

  @ApiPropertyOptional({ example: 12 })
  branchId?: number | string;

  @ApiPropertyOptional({ example: 'SUP-GSDK-01' })
  deviceCode?: string;

  @ApiPropertyOptional({ example: 'IN,OUT' })
  punchTypes?: string;

  @ApiPropertyOptional()
  filterRules?: Record<string, unknown> | string;
}
