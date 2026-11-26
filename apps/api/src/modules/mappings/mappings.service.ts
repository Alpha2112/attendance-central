import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseClient } from '@attendance/database';
import { DeviceEmployeeMappingRepository } from '@attendance/database';
import { DeviceRepository } from '@attendance/database';
import { OrganizationRepository } from '@attendance/database';
import { type DeviceEmployeeMappingWithDevice } from '@attendance/database';
import { AppLogger } from '@attendance/logging';
import { LOGGER_TOKEN } from '../logging/logging.module.js';
import { CreateMappingApiDto } from './dto/create-mapping.dto.js';
import { UpdateMappingApiDto } from './dto/update-mapping.dto.js';
import {
  type BulkMappingRowDto,
  type BulkDefaultsDto,
  type BulkValidateResult,
  type BulkImportResult,
  type ValidatedRow,
  type NormalizedRow,
  type RowIssue,
  type ImportRowResult,
} from './dto/bulk-mapping.dto.js';
import {
  type OrganizationEntity,
  type DeviceEntity,
  type DeviceEmployeeMappingWithDevice as _MappingRow,
} from '@attendance/database';

/** Pre-loaded lookup maps shared across all rows of one bulk operation. */
interface BulkContext {
  orgById: Map<number, OrganizationEntity>;
  orgByCode: Map<string, OrganizationEntity>;
  deviceById: Map<number, DeviceEntity>;
  deviceByOrgCode: Map<string, DeviceEntity>;
  deviceByCode: Map<string, DeviceEntity>;
  existingDeviceVendor: Set<string>;
  existingDeviceEmp: Set<string>;
}

@Injectable()
export class MappingsService {
  private readonly mappingRepo: DeviceEmployeeMappingRepository;
  private readonly deviceRepo: DeviceRepository;
  private readonly orgRepo: OrganizationRepository;

  constructor(
    @Inject(DatabaseClient) private readonly dbClient: DatabaseClient,
    @Inject(LOGGER_TOKEN) private readonly logger: AppLogger,
  ) {
    this.mappingRepo = new DeviceEmployeeMappingRepository(this.dbClient);
    this.deviceRepo = new DeviceRepository(this.dbClient);
    this.orgRepo = new OrganizationRepository(this.dbClient);
  }

  public async findAll(orgIdOrCode?: string | number): Promise<DeviceEmployeeMappingWithDevice[]> {
    let numericOrgId: number | undefined;
    if (orgIdOrCode) {
      if (typeof orgIdOrCode === 'number') {
        numericOrgId = orgIdOrCode;
      } else {
        const org = await this.orgRepo.findByCode(orgIdOrCode);
        if (org) numericOrgId = org.id;
      }
    }
    return this.mappingRepo.findAll(numericOrgId);
  }

  public async findById(id: number): Promise<DeviceEmployeeMappingWithDevice> {
    const mapping = await this.mappingRepo.findById(id);
    if (!mapping) {
      throw new NotFoundException(`Identity mapping with ID ${id} not found`);
    }
    return mapping;
  }

  /**
   * Resolve an organization reference (numeric id, numeric-string id, or org
   * CODE) to a concrete organization id, validating that it exists. Returns the
   * fallback when no reference is supplied.
   */
  private async resolveOrganizationId(
    organizationId: string | number | undefined,
    fallback: number,
  ): Promise<number> {
    if (organizationId === undefined || organizationId === null || organizationId === '') {
      return fallback;
    }

    // Numeric id (number, or a string that is purely digits)
    const asNumber =
      typeof organizationId === 'number'
        ? organizationId
        : /^\d+$/.test(organizationId.trim())
          ? Number(organizationId.trim())
          : NaN;

    if (!Number.isNaN(asNumber)) {
      const org = await this.orgRepo.findById(asNumber);
      if (!org) throw new BadRequestException(`Organization ${asNumber} does not exist.`);
      return org.id;
    }

    // Otherwise treat it as an organization code
    const byCode = await this.orgRepo.findByCode(String(organizationId));
    if (!byCode) throw new BadRequestException(`Organization "${organizationId}" does not exist.`);
    return byCode.id;
  }

  public async create(dto: CreateMappingApiDto): Promise<DeviceEmployeeMappingWithDevice> {
    // 1. Resolve organization (defaults to org 1 when none supplied)
    const orgId = await this.resolveOrganizationId(dto.organizationId, 1);

    // 2. Resolve target device
    let targetDeviceId = dto.deviceId;
    if (!targetDeviceId && dto.deviceCode) {
      const dev = await this.deviceRepo.findByOrgAndCode(orgId, dto.deviceCode);
      if (dev) {
        targetDeviceId = dev.id;
      }
    }

    if (!targetDeviceId) {
      // Fallback: pick first active device in the organization if not explicitly provided
      const devices = await this.deviceRepo.listByOrg(orgId);
      if (devices.length > 0 && devices[0]) {
        targetDeviceId = devices[0].id;
      } else {
        throw new BadRequestException('No target device found for mapping');
      }
    }

    // 3. Metadata packing
    const metadata: Record<string, unknown> = {};
    if (dto.employeeName) metadata['employeeName'] = dto.employeeName;
    if (dto.department) metadata['department'] = dto.department;
    if (dto.cardNo) metadata['cardNo'] = dto.cardNo;

    const mappingId = await this.mappingRepo.createOrUpdate({
      organizationId: orgId,
      deviceId: targetDeviceId,
      externalEmployeeId: dto.externalEmployeeId,
      vendorUserId: dto.vendorUserId,
      vendorEmployeeCode: dto.vendorEmployeeCode || dto.vendorUserId,
      status: dto.status || 'ACTIVE',
      metadata,
    });

    this.logger.info(
      {
        mappingId,
        externalEmployeeId: dto.externalEmployeeId,
        vendorUserId: dto.vendorUserId,
        deviceId: targetDeviceId,
      },
      'Created identity mapping',
    );

    return await this.findById(mappingId);
  }

  public async update(
    id: number,
    dto: UpdateMappingApiDto,
  ): Promise<DeviceEmployeeMappingWithDevice> {
    const existing = await this.findById(id);

    // Merge metadata
    const metadata: Record<string, unknown> = { ...(existing.metadata || {}) };
    if (dto.employeeName !== undefined) metadata['employeeName'] = dto.employeeName;
    if (dto.department !== undefined) metadata['department'] = dto.department;
    if (dto.cardNo !== undefined) metadata['cardNo'] = dto.cardNo;

    // Re-bind the organization when a new reference is supplied; otherwise keep
    // the mapping on its current organization.
    const newOrgId =
      dto.organizationId !== undefined && dto.organizationId !== ''
        ? await this.resolveOrganizationId(dto.organizationId, existing.organization_id)
        : undefined;
    const effectiveOrgId = newOrgId ?? existing.organization_id;

    let targetDeviceId = dto.deviceId;
    if (!targetDeviceId && dto.deviceCode) {
      const dev = await this.deviceRepo.findByOrgAndCode(effectiveOrgId, dto.deviceCode);
      if (dev) targetDeviceId = dev.id;
    }

    await this.mappingRepo.update(id, {
      externalEmployeeId: dto.externalEmployeeId,
      vendorUserId: dto.vendorUserId,
      vendorEmployeeCode: dto.vendorEmployeeCode,
      status: dto.status,
      deviceId: targetDeviceId,
      organizationId: newOrgId,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    });

    this.logger.info({ id }, 'Updated identity mapping');
    return await this.findById(id);
  }

  public async delete(id: number): Promise<void> {
    await this.findById(id);
    await this.mappingRepo.delete(id);
    this.logger.info({ id }, 'Deleted identity mapping');
  }

  // ======================= Bulk import / validation =======================

  /**
   * Validate a batch of employee-mapping rows WITHOUT writing anything. Returns
   * every row normalized and classified as valid / warning / error, with
   * row-level issues and a summary, so the UI can preview and let the user fix
   * problems before importing.
   */
  public async validateBulk(
    rows: BulkMappingRowDto[],
    defaults?: BulkDefaultsDto,
  ): Promise<BulkValidateResult> {
    const validated = await this.normalizeAndValidate(rows ?? [], defaults);

    const summary = {
      total: validated.length,
      valid: validated.filter((r) => r.level === 'valid').length,
      warnings: validated.filter((r) => r.level === 'warning').length,
      errors: validated.filter((r) => r.level === 'error').length,
      willCreate: validated.filter((r) => r.level !== 'error' && !r.willUpdate).length,
      willUpdate: validated.filter((r) => r.level !== 'error' && r.willUpdate).length,
    };

    return { summary, rows: validated };
  }

  /**
   * Import a batch of employee-mapping rows. Re-validates server-side (never
   * trusting the client), skips rows with hard errors, and upserts the rest via
   * the repository's idempotent create-or-update (so re-running the same import
   * does not create duplicates). Each row is isolated: one failure never aborts
   * the batch, and every outcome is reported.
   */
  public async importBulk(
    rows: BulkMappingRowDto[],
    defaults?: BulkDefaultsDto,
  ): Promise<BulkImportResult> {
    const validated = await this.normalizeAndValidate(rows ?? [], defaults);
    const results: ImportRowResult[] = [];

    for (const row of validated) {
      const n = row.normalized;
      if (row.level === 'error') {
        const firstError = row.issues.find((i) => i.level === 'error');
        results.push({
          rowId: row.rowId,
          externalEmployeeId: n.externalEmployeeId || '(missing)',
          status: 'skipped',
          message: firstError?.message ?? 'Row has validation errors',
        });
        continue;
      }

      try {
        const metadata: Record<string, unknown> = {};
        if (n.employeeName) metadata['employeeName'] = n.employeeName;
        if (n.organizationName) metadata['department'] = n.organizationName;
        if (n.cardNo) metadata['cardNo'] = n.cardNo;

        const mappingId = await this.mappingRepo.createOrUpdate({
          organizationId: n.organizationId!,
          deviceId: n.deviceId!,
          externalEmployeeId: n.externalEmployeeId,
          vendorUserId: n.vendorUserId,
          vendorEmployeeCode: n.vendorUserId,
          status: n.status,
          metadata,
        });

        results.push({
          rowId: row.rowId,
          externalEmployeeId: n.externalEmployeeId,
          status: row.willUpdate ? 'updated' : 'imported',
          message: row.willUpdate ? 'Updated existing mapping' : 'Imported',
          mappingId,
        });
      } catch (err) {
        results.push({
          rowId: row.rowId,
          externalEmployeeId: n.externalEmployeeId,
          status: 'failed',
          message: err instanceof Error ? err.message : 'Import failed',
        });
      }
    }

    const summary = {
      total: results.length,
      imported: results.filter((r) => r.status === 'imported').length,
      updated: results.filter((r) => r.status === 'updated').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      failed: results.filter((r) => r.status === 'failed').length,
    };

    this.logger.info({ summary }, 'Bulk mapping import completed');
    return { summary, results };
  }

  /** Build the shared lookup maps used to validate a whole batch in one pass. */
  private async buildBulkContext(): Promise<BulkContext> {
    const [orgs, devices, existing] = await Promise.all([
      this.orgRepo.list(),
      this.deviceRepo.findAll(),
      this.mappingRepo.findAll(),
    ]);

    const orgById = new Map<number, OrganizationEntity>();
    const orgByCode = new Map<string, OrganizationEntity>();
    for (const o of orgs) {
      orgById.set(o.id, o);
      orgByCode.set(o.code.toLowerCase(), o);
    }

    const deviceById = new Map<number, DeviceEntity>();
    const deviceByOrgCode = new Map<string, DeviceEntity>();
    const deviceByCode = new Map<string, DeviceEntity>();
    for (const d of devices) {
      deviceById.set(d.id, d);
      deviceByOrgCode.set(`${d.organization_id}::${d.device_code.toLowerCase()}`, d);
      if (!deviceByCode.has(d.device_code.toLowerCase())) {
        deviceByCode.set(d.device_code.toLowerCase(), d);
      }
    }

    const existingDeviceVendor = new Set<string>();
    const existingDeviceEmp = new Set<string>();
    for (const m of existing as _MappingRow[]) {
      existingDeviceVendor.add(`${m.device_id}::${m.vendor_user_id}`);
      existingDeviceEmp.add(`${m.device_id}::${m.external_employee_id}`);
    }

    return {
      orgById,
      orgByCode,
      deviceById,
      deviceByOrgCode,
      deviceByCode,
      existingDeviceVendor,
      existingDeviceEmp,
    };
  }

  /** Normalize + validate every row against the shared context and each other. */
  private async normalizeAndValidate(
    rows: BulkMappingRowDto[],
    defaults?: BulkDefaultsDto,
  ): Promise<ValidatedRow[]> {
    const ctx = await this.buildBulkContext();
    const seenDeviceVendor = new Map<string, number>(); // key -> first row index
    const seenDeviceEmp = new Map<string, number>();
    const out: ValidatedRow[] = [];

    rows.forEach((raw, index) => {
      const issues: RowIssue[] = [];
      const err = (field: string, message: string): void => {
        issues.push({ field, level: 'error', message });
      };
      const warn = (field: string, message: string): void => {
        issues.push({ field, level: 'warning', message });
      };

      const externalEmployeeId = str(raw.externalEmployeeId);
      const employeeName = str(raw.employeeName) || null;
      const vendorUserId = str(raw.vendorUserId);
      const cardNo = str(raw.cardNo) || null;

      // --- Status ---
      let status = (str(raw.status) || str(defaults?.status) || 'ACTIVE').toUpperCase();
      if (status !== 'ACTIVE' && status !== 'INACTIVE') {
        err('status', `Invalid status "${status}" (must be ACTIVE or INACTIVE).`);
        status = 'ACTIVE';
      }

      // --- Required identity fields ---
      if (!externalEmployeeId) err('externalEmployeeId', 'Employee ID is required.');
      if (!vendorUserId) err('vendorUserId', 'Biometric Vendor User ID is required.');

      // --- Organization resolution ---
      const orgRef = raw.organizationId ?? defaults?.organizationId;
      let org: OrganizationEntity | undefined;
      if (orgRef === undefined || orgRef === null || String(orgRef).trim() === '') {
        err('organizationId', 'Organization is required.');
      } else {
        const refStr = String(orgRef).trim();
        if (/^\d+$/.test(refStr)) {
          org = ctx.orgById.get(Number(refStr));
          if (!org) err('organizationId', `Unknown organization id "${refStr}".`);
        } else {
          org = ctx.orgByCode.get(refStr.toLowerCase());
          if (!org) err('organizationId', `Unknown organization "${refStr}".`);
        }
      }

      // --- Device / target terminal resolution ---
      let device: DeviceEntity | undefined;
      const deviceIdRef =
        raw.deviceId !== undefined && raw.deviceId !== null
          ? Number(raw.deviceId)
          : defaults?.deviceId !== undefined && defaults?.deviceId !== null
            ? Number(defaults.deviceId)
            : undefined;
      const deviceCodeRef = str(raw.deviceCode);

      if (deviceIdRef !== undefined && !Number.isNaN(deviceIdRef)) {
        device = ctx.deviceById.get(deviceIdRef);
        if (!device) err('deviceId', `Unknown target terminal id "${deviceIdRef}".`);
      } else if (deviceCodeRef) {
        // Prefer a device matching the resolved org, else fall back to any match.
        device =
          (org ? ctx.deviceByOrgCode.get(`${org.id}::${deviceCodeRef.toLowerCase()}`) : undefined) ??
          ctx.deviceByCode.get(deviceCodeRef.toLowerCase());
        if (!device) err('deviceCode', `Unknown target terminal "${deviceCodeRef}".`);
      } else {
        err('deviceId', 'Target terminal is required.');
      }

      // --- Cross-row and cross-system duplicate detection ---
      let willUpdate = false;
      if (device && vendorUserId) {
        const key = `${device.id}::${vendorUserId}`;
        const firstIdx = seenDeviceVendor.get(key);
        if (firstIdx !== undefined) {
          err(
            'vendorUserId',
            `Duplicate: Vendor User ID "${vendorUserId}" is used on this terminal by row ${firstIdx + 1} in this file.`,
          );
        } else {
          seenDeviceVendor.set(key, index);
        }
        if (ctx.existingDeviceVendor.has(key)) willUpdate = true;
      }
      if (device && externalEmployeeId) {
        const key = `${device.id}::${externalEmployeeId}`;
        const firstIdx = seenDeviceEmp.get(key);
        if (firstIdx !== undefined) {
          err(
            'externalEmployeeId',
            `Duplicate: Employee "${externalEmployeeId}" is already mapped to this terminal by row ${firstIdx + 1} in this file.`,
          );
        } else {
          seenDeviceEmp.set(key, index);
        }
        if (ctx.existingDeviceEmp.has(key)) willUpdate = true;
      }
      if (willUpdate) {
        warn('externalEmployeeId', 'A mapping for this employee/terminal already exists — it will be updated.');
      }

      const normalized: NormalizedRow = {
        rowId: raw.rowId,
        externalEmployeeId,
        employeeName,
        organizationId: org?.id ?? null,
        organizationCode: org?.code ?? null,
        organizationName: org?.name ?? null,
        vendorUserId,
        cardNo,
        deviceId: device?.id ?? null,
        deviceCode: device?.device_code ?? null,
        deviceName: device?.name ?? null,
        status,
      };

      const hasError = issues.some((i) => i.level === 'error');
      const hasWarning = issues.some((i) => i.level === 'warning');
      const level: ValidatedRow['level'] = hasError ? 'error' : hasWarning ? 'warning' : 'valid';

      out.push({ rowId: raw.rowId, level, willUpdate, normalized, issues });
    });

    return out;
  }
}

/** Trim a possibly-undefined scalar to a string ('' when absent). */
function str(v: unknown): string {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}
