import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * One inbound row for a bulk employee-mapping import. All fields are optional on
 * the wire; the server validates required values and resolves organization /
 * device references. `rowId` is an opaque client-side identifier echoed back in
 * validation and import results so the UI can match outcomes to its own rows.
 */
export class BulkMappingRowDto {
  @ApiPropertyOptional({ description: 'Opaque client row id, echoed back in results' })
  rowId?: string | number;

  @ApiPropertyOptional({ example: 'EMP-1001' })
  externalEmployeeId?: string;

  @ApiPropertyOptional({ example: 'Sarah Jenkins' })
  employeeName?: string;

  @ApiPropertyOptional({ example: 'ORG-TECHIVE', description: 'Organization code or numeric id' })
  organizationId?: string | number;

  @ApiPropertyOptional({ example: '1001', description: 'Biometric vendor user id on the terminal' })
  vendorUserId?: string;

  @ApiPropertyOptional({ example: 'CRD-88910' })
  cardNo?: string;

  @ApiPropertyOptional({ example: 57, description: 'Numeric target device id' })
  deviceId?: number;

  @ApiPropertyOptional({ example: 'DEV-HQ-ZK01', description: 'Target device code' })
  deviceCode?: string;

  @ApiPropertyOptional({ example: 'ACTIVE', enum: ['ACTIVE', 'INACTIVE'] })
  status?: string;
}

/** Global defaults applied to every row that does not override them. */
export class BulkDefaultsDto {
  @ApiPropertyOptional({ example: 57 })
  deviceId?: number;

  @ApiPropertyOptional({ example: 'ORG-TECHIVE' })
  organizationId?: string | number;

  @ApiPropertyOptional({ example: 'ACTIVE' })
  status?: string;
}

export class BulkValidateDto {
  @ApiProperty({ type: [BulkMappingRowDto] })
  rows!: BulkMappingRowDto[];

  @ApiPropertyOptional({ type: BulkDefaultsDto })
  defaults?: BulkDefaultsDto;
}

export class BulkImportDto {
  @ApiProperty({ type: [BulkMappingRowDto] })
  rows!: BulkMappingRowDto[];

  @ApiPropertyOptional({ type: BulkDefaultsDto })
  defaults?: BulkDefaultsDto;
}

// ---- Response shapes (documented for clarity; returned as plain objects) ----

export type IssueLevel = 'error' | 'warning';
export type RowLevel = 'valid' | 'warning' | 'error';

export interface RowIssue {
  field: string;
  level: IssueLevel;
  message: string;
}

export interface NormalizedRow {
  rowId?: string | number;
  externalEmployeeId: string;
  employeeName: string | null;
  organizationId: number | null;
  organizationCode: string | null;
  organizationName: string | null;
  vendorUserId: string;
  cardNo: string | null;
  deviceId: number | null;
  deviceCode: string | null;
  deviceName: string | null;
  status: string;
}

export interface ValidatedRow {
  rowId?: string | number;
  level: RowLevel;
  willUpdate: boolean;
  normalized: NormalizedRow;
  issues: RowIssue[];
}

export interface BulkValidateResult {
  summary: {
    total: number;
    valid: number;
    warnings: number;
    errors: number;
    willCreate: number;
    willUpdate: number;
  };
  rows: ValidatedRow[];
}

export interface ImportRowResult {
  rowId?: string | number;
  externalEmployeeId: string;
  status: 'imported' | 'updated' | 'skipped' | 'failed';
  message: string;
  mappingId?: number;
}

export interface BulkImportResult {
  summary: {
    total: number;
    imported: number;
    updated: number;
    skipped: number;
    failed: number;
  };
  results: ImportRowResult[];
}
