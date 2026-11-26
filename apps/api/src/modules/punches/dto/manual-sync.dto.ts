import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Request to FETCH punch-log candidates from one terminal for a date range.
 * This is non-destructive — it only reads the device and validates; nothing is
 * written to attendance_logs until a subsequent commit.
 */
export class ManualSyncFetchDto {
  @ApiProperty({ description: 'Device ID or device code to sync from', example: 'DEV-HQ-HIK01' })
  deviceId!: string | number;

  @ApiProperty({ description: 'Inclusive start date (YYYY-MM-DD)', example: '2026-11-01' })
  from!: string;

  @ApiProperty({ description: 'Inclusive end date (YYYY-MM-DD)', example: '2026-11-24' })
  to!: string;
}

/** A single candidate row the client sends back to commit. */
export class ManualSyncCommitRowDto {
  @ApiProperty() vendorUserId!: string;
  @ApiProperty() punchTimeUtc!: string; // ISO
  @ApiProperty() punchType!: string;
  @ApiProperty() verificationType!: string;
  @ApiPropertyOptional() deviceRecordId?: string;
  @ApiPropertyOptional() cardNo?: string;
  @ApiPropertyOptional() userName?: string;
}

/** Request to COMMIT the user-selected candidates of a fetched job. */
export class ManualSyncCommitDto {
  @ApiProperty({ description: 'The sync job id returned by fetch' })
  jobId!: number;

  @ApiProperty({
    type: [ManualSyncCommitRowDto],
    description: 'Selected candidate rows to persist',
  })
  rows!: ManualSyncCommitRowDto[];
}

// ----------------------------- Response shapes -----------------------------

export type SyncRowLevel = 'valid' | 'warning' | 'error';

export interface SyncRowIssue {
  field: string;
  level: 'error' | 'warning';
  message: string;
}

export interface SyncCandidate {
  rowId: string;
  vendorUserId: string;
  externalEmployeeId: string;
  employeeName: string | null;
  mapped: boolean;
  deviceRecordId: string;
  punchTimeUtc: string; // ISO
  punchTimeLocal: string;
  eventDate: string; // YYYY-MM-DD
  punchType: string;
  verificationType: string;
  cardNo: string | null;
  fingerprint: string;
  level: SyncRowLevel;
  alreadySynced: boolean;
  duplicateInBatch: boolean;
  willImport: boolean;
  issues: SyncRowIssue[];
}

export interface ManualSyncFetchResult {
  jobId: number;
  deviceId: number;
  deviceCode: string;
  deviceName: string;
  vendor: string;
  from: string;
  to: string;
  dateRangeSupported: boolean;
  summary: {
    total: number;
    valid: number;
    warnings: number;
    errors: number;
    duplicatesInBatch: number;
    alreadySynced: number;
    willImport: number;
  };
  candidates: SyncCandidate[];
}

export interface ManualSyncCommitRowResult {
  rowId?: string;
  externalEmployeeId: string;
  deviceRecordId: string;
  status: 'imported' | 'duplicate' | 'skipped' | 'failed';
  message: string;
}

export interface ManualSyncCommitResult {
  jobId: number;
  summary: { total: number; imported: number; duplicates: number; skipped: number; failed: number };
  durationMs: number;
  results: ManualSyncCommitRowResult[];
}
