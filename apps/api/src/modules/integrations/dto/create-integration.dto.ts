import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateIntegrationDto {
  @ApiProperty({ example: 'Workday HRMS Primary Webhook' })
  name!: string;

  @ApiPropertyOptional({
    example: 'HRMS_WEBHOOK',
    enum: ['HRMS_WEBHOOK', 'ERP_SYNC', 'WEBHOOK', 'CUSTOM'],
  })
  targetType?: string;

  @ApiProperty({ example: 'https://hrms.example.com/api/v1/attendance/events' })
  endpointUrl!: string;

  @ApiPropertyOptional({
    example: 'ORG-TECHIVE',
    description:
      'Optional organization id to send. Injected into each delivered payload as organizationId. Blank = use the event’s own organization.',
  })
  organizationId?: string;

  @ApiPropertyOptional({
    example: 'TENANT-XYZ',
    description:
      'Optional tenant id to tag deliveries with. Injected into each delivered payload as tenantId so the receiver can map/match on it. Blank = tenantId is omitted.',
  })
  tenantId?: string;

  @ApiPropertyOptional({
    example: 'HMAC_SHA256',
    enum: ['HMAC_SHA256', 'ED25519', 'NONE'],
    description:
      'Signing mode: HMAC_SHA256 (shared secret), ED25519 (platform signs with a private key; receiver verifies with the public key), or NONE.',
  })
  authType?: string;

  @ApiPropertyOptional({
    example: 'attendance.normalized.v1',
    description: 'Comma-separated event types to subscribe to',
  })
  eventTypes?: string;

  @ApiPropertyOptional({ example: 5 })
  retryLimit?: number;

  @ApiPropertyOptional({ example: 10000 })
  timeoutMs?: number;

  @ApiPropertyOptional({ example: 'ACTIVE', enum: ['ACTIVE', 'PAUSED', 'DISABLED'] })
  status?: string;

  // ---- Routing filters (only this company's punches, optionally narrowed) ----

  @ApiPropertyOptional({
    example: 12,
    description: 'Only deliver punches from this branch id. Omit to deliver all branches.',
  })
  branchId?: number | string;

  @ApiPropertyOptional({
    example: 'SUP-GSDK-01',
    description: 'Only deliver punches from this device code. Omit to deliver all devices.',
  })
  deviceCode?: string;

  @ApiPropertyOptional({
    example: 'IN,OUT',
    description: 'Comma-separated punch types to deliver (e.g. IN,OUT). Omit to deliver all types.',
  })
  punchTypes?: string;

  @ApiPropertyOptional({
    description: 'Advanced: raw filter_rules JSON object merged into the above.',
  })
  filterRules?: Record<string, unknown> | string;
}
