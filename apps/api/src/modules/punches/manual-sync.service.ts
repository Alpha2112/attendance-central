import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DatabaseClient,
  DeviceRepository,
  AttendanceLogRepository,
  DeviceEmployeeMappingRepository,
  OutboxRepository,
  SyncRepository,
  runInTransaction,
  type DeviceEntity,
} from '@attendance/database';
import { AppLogger } from '@attendance/logging';
import { LOGGER_TOKEN } from '../logging/logging.module.js';
import {
  generateEventFingerprint,
  normalizePunchType,
  normalizeVerificationType,
  PunchType,
  type RawAttendanceEvent,
  type DeviceModel,
  type SyncCursor,
  type AttendanceDeviceAdapter,
} from '@attendance/contracts';
import { HikvisionDeviceAdapter } from '@attendance/adapter-hikvision';
import { SupremaDeviceAdapter } from '@attendance/adapter-suprema';
import { ZKTecoDeviceAdapter } from '@attendance/adapter-zkteco';
import { AnvizDeviceAdapter } from '@attendance/adapter-anviz';
import { randomUUID } from 'node:crypto';
import {
  type ManualSyncFetchResult,
  type ManualSyncCommitResult,
  type ManualSyncCommitRowDto,
  type SyncCandidate,
  type SyncRowIssue,
} from './dto/manual-sync.dto.js';

/** Org code embedded in fingerprints — MUST match the automatic sync path so a
 *  manual pull dedups against automatically-synced rows. */
const ORG_CODE = 'ORG-TECHIVE';
const WEBHOOK_EVENT_TYPE = 'attendance.normalized.v1';
/** Vendors whose adapter honours a true historical date-range pull. Others are
 *  still synced, but the UI is told the range is best-effort. */
const DATE_RANGE_VENDORS = new Set(['HIKVISION', 'SUPREMA']);
const MAX_PAGES = 60;
const MAX_EVENTS = 5000;

/**
 * Manual, staged terminal synchronization — isolated from the automatic poller /
 * realtime stream so it can never interfere with them. Two steps:
 *   fetch()  — pull + normalize + validate candidates for a date range (NO write)
 *   commit() — idempotently persist the user-selected candidates as MANUAL rows
 * Every run is recorded in sync_jobs for the audit trail.
 */
@Injectable()
export class ManualSyncService {
  private readonly deviceRepo: DeviceRepository;
  private readonly attendanceRepo: AttendanceLogRepository;
  private readonly mappingRepo: DeviceEmployeeMappingRepository;
  private readonly outboxRepo: OutboxRepository;
  private readonly syncRepo: SyncRepository;
  private readonly adapterCache = new Map<string, AttendanceDeviceAdapter>();

  constructor(
    @Inject(DatabaseClient) private readonly db: DatabaseClient,
    @Inject(LOGGER_TOKEN) private readonly logger: AppLogger,
  ) {
    this.deviceRepo = new DeviceRepository(this.db);
    this.attendanceRepo = new AttendanceLogRepository(this.db);
    this.mappingRepo = new DeviceEmployeeMappingRepository(this.db);
    this.outboxRepo = new OutboxRepository(this.db);
    this.syncRepo = new SyncRepository(this.db);
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  public async fetch(
    deviceIdOrCode: string | number,
    from: string,
    to: string,
    requestedBy: string,
  ): Promise<ManualSyncFetchResult> {
    const { fromDate, toDate } = this.validateRange(from, to);
    const device = await this.resolveDevice(deviceIdOrCode);
    const vendor = (device.vendor || '').toUpperCase();

    const jobId = await this.syncRepo.createJob({
      organizationId: device.organization_id,
      deviceId: device.id,
      jobType: 'MANUAL',
      dateFrom: fromDate,
      dateTo: toDate,
      requestedBy,
    });
    await this.syncRepo.updateJobProgress(jobId, { status: 'RUNNING', startedAt: new Date() });

    let rawEvents: RawAttendanceEvent[];
    try {
      rawEvents = await this.pullRange(device, fromDate, toDate);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.syncRepo.updateJobProgress(jobId, {
        status: 'FAILED',
        completedAt: new Date(),
        errorCode: 'DEVICE_FETCH_FAILED',
        errorMessage: message,
      });
      throw new ServiceUnavailableException(
        `Could not fetch from terminal "${device.device_code}": ${message}`,
      );
    }

    // Normalize every in-range event into a candidate.
    const candidates: SyncCandidate[] = [];
    for (let i = 0; i < rawEvents.length; i++) {
      const c = await this.normalizeCandidate(device, rawEvents[i]!, `r${i}`);
      if (c) candidates.push(c);
    }

    // Cross-path dedup: an event already in attendance_logs (by vendor_event_id OR
    // fingerprint, on this device) is flagged alreadySynced so commit skips it.
    const { byRecordId, byFingerprint } = await this.loadExisting(device.id, candidates);
    const seenFingerprints = new Set<string>();
    for (const c of candidates) {
      if (c.deviceRecordId && byRecordId.has(c.deviceRecordId)) c.alreadySynced = true;
      if (byFingerprint.has(c.fingerprint)) c.alreadySynced = true;
      if (seenFingerprints.has(c.fingerprint)) c.duplicateInBatch = true;
      else seenFingerprints.add(c.fingerprint);
      this.applyLevel(c);
    }

    const summary = this.summarize(candidates);
    await this.syncRepo.updateJobProgress(jobId, {
      status: 'FETCHED',
      recordsReceived: candidates.length,
    });

    return {
      jobId,
      deviceId: device.id,
      deviceCode: device.device_code,
      deviceName: device.name,
      vendor,
      from: fromDate,
      to: toDate,
      dateRangeSupported: DATE_RANGE_VENDORS.has(vendor),
      summary,
      candidates,
    };
  }

  public async commit(
    jobId: number,
    rows: ManualSyncCommitRowDto[],
    requestedBy: string,
  ): Promise<ManualSyncCommitResult> {
    const started = Date.now();
    const job = await this.syncRepo.findJobById(jobId);
    if (!job) throw new NotFoundException(`Sync job ${jobId} not found`);
    const device = await this.deviceRepo.findById(job.device_id);
    if (!device) throw new NotFoundException(`Device ${job.device_id} not found`);

    const results: ManualSyncCommitResult['results'] = [];
    let imported = 0;
    let duplicates = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rows) {
      const deviceRecordId = row.deviceRecordId || '';
      try {
        const deviceTime = new Date(row.punchTimeUtc);
        if (!row.vendorUserId || isNaN(deviceTime.getTime())) {
          skipped++;
          results.push({
            externalEmployeeId: '',
            deviceRecordId,
            status: 'skipped',
            message: 'Missing vendor user id or invalid timestamp',
          });
          continue;
        }
        const outcome = await this.commitRow(device, row, deviceTime, jobId);
        results.push(outcome);
        if (outcome.status === 'imported') imported++;
        else if (outcome.status === 'duplicate') duplicates++;
        else if (outcome.status === 'skipped') skipped++;
        else failed++;
      } catch (err: unknown) {
        failed++;
        results.push({
          externalEmployeeId: '',
          deviceRecordId,
          status: 'failed',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await this.syncRepo.updateJobProgress(jobId, {
      status: 'COMPLETED',
      completedAt: new Date(),
      recordsInserted: imported,
      duplicates,
      errors: failed,
    });
    this.logger.info(
      { jobId, deviceId: device.id, imported, duplicates, skipped, failed, requestedBy },
      'Manual sync commit finished',
    );

    return {
      jobId,
      summary: { total: rows.length, imported, duplicates, skipped, failed },
      durationMs: Date.now() - started,
      results,
    };
  }

  public async listJobs(filters?: {
    deviceId?: number;
    status?: string;
    limit?: number;
  }): Promise<Array<Record<string, unknown>>> {
    const jobs = await this.syncRepo.listJobs({ ...filters, jobType: 'MANUAL' });
    const deviceById = new Map<number, DeviceEntity>();
    for (const j of jobs) {
      if (!deviceById.has(j.device_id)) {
        const d = await this.deviceRepo.findById(j.device_id);
        if (d) deviceById.set(j.device_id, d);
      }
    }
    return jobs.map((j) => {
      const d = deviceById.get(j.device_id);
      const durationMs =
        j.started_at && j.completed_at
          ? new Date(j.completed_at).getTime() - new Date(j.started_at).getTime()
          : null;
      return {
        id: j.id,
        deviceId: j.device_id,
        deviceCode: d?.device_code ?? `DEV-${j.device_id}`,
        deviceName: d?.name ?? null,
        vendor: d?.vendor ?? null,
        dateFrom: j.date_from,
        dateTo: j.date_to,
        status: j.status,
        requestedBy: j.requested_by,
        requestedAt: j.requested_at,
        startedAt: j.started_at,
        completedAt: j.completed_at,
        durationMs,
        recordsReceived: j.records_received,
        recordsInserted: j.records_inserted,
        duplicates: j.duplicates,
        errors: j.errors,
        errorMessage: j.error_message,
      };
    });
  }

  // --------------------------------------------------------------------------
  // Internals
  // --------------------------------------------------------------------------

  private validateRange(from: string, to: string): { fromDate: string; toDate: string } {
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRe.test(from) || !dateRe.test(to)) {
      throw new BadRequestException('from/to must be dates in YYYY-MM-DD format');
    }
    if (from > to) {
      throw new BadRequestException('"from" date must be on or before "to" date');
    }
    return { fromDate: from, toDate: to };
  }

  private async resolveDevice(deviceIdOrCode: string | number): Promise<DeviceEntity> {
    let device: DeviceEntity | null = null;
    if (typeof deviceIdOrCode === 'number') {
      device = await this.deviceRepo.findById(deviceIdOrCode);
    } else {
      const parsed = parseInt(deviceIdOrCode, 10);
      if (!isNaN(parsed)) device = await this.deviceRepo.findById(parsed);
      if (!device) device = await this.deviceRepo.findByOrgAndCode(1, deviceIdOrCode);
    }
    if (!device) throw new NotFoundException(`Device ${deviceIdOrCode} not found in registry`);
    return device;
  }

  private resolveAdapter(vendor: string): AttendanceDeviceAdapter {
    const v = (vendor || '').toUpperCase();
    const cached = this.adapterCache.get(v);
    if (cached) return cached;
    let adapter: AttendanceDeviceAdapter;
    switch (v) {
      case 'HIKVISION':
        adapter = new HikvisionDeviceAdapter(this.logger);
        break;
      case 'SUPREMA':
        adapter = new SupremaDeviceAdapter(this.logger);
        break;
      case 'ZKTECO':
        adapter = new ZKTecoDeviceAdapter(this.logger);
        break;
      case 'ANVIZ':
        adapter = new AnvizDeviceAdapter(this.logger);
        break;
      default:
        throw new BadRequestException(`Manual sync is not supported for vendor "${vendor}"`);
    }
    this.adapterCache.set(v, adapter);
    return adapter;
  }

  private toDeviceModel(device: DeviceEntity): DeviceModel {
    return {
      id: String(device.id),
      organizationId: String(device.organization_id),
      deviceCode: device.device_code,
      serialNumber: device.serial_number || undefined,
      name: device.name,
      vendor: device.vendor,
      connectionMode: (device.connection_mode as 'PUSH' | 'PULL' | 'HYBRID') || 'HYBRID',
      status: (device.status as DeviceModel['status']) || 'ONLINE',
      host: device.host || undefined,
      port: device.port || undefined,
      timezone: device.timezone || 'UTC',
      metadata: (device.metadata as Record<string, unknown>) || {},
      createdAt: new Date(device.created_at ?? Date.now()).toISOString(),
      updatedAt: new Date(device.updated_at ?? Date.now()).toISOString(),
    };
  }

  /** Pages the device adapter from the `from` date forward, keeping only events
   *  whose (UTC) date falls within [from, to]. Bounded by MAX_PAGES/MAX_EVENTS. */
  private async pullRange(
    device: DeviceEntity,
    fromDate: string,
    toDate: string,
  ): Promise<RawAttendanceEvent[]> {
    const adapter = this.resolveAdapter(device.vendor);
    const model = this.toDeviceModel(device);
    const vendor = (device.vendor || '').toUpperCase();
    // Hikvision supports a precise server-side date-range search (startTime+endTime).
    // Other vendors page by index and we filter by date client-side. The window is
    // held FIXED across pages; only the position advances.
    const windowCursor: SyncCursor =
      vendor === 'HIKVISION'
        ? { lastLogTimestamp: `${fromDate}T00:00:00Z`, custom: { endTime: `${toDate}T23:59:59Z` } }
        : {};

    const collected: RawAttendanceEvent[] = [];
    const seenRecordIds = new Set<string>();
    let position = 0;

    // Hikvision filters server-side by date, so a few pages suffice. Suprema reads
    // its whole on-device log forward by (large) event id to reach recent punches,
    // so it needs a much higher page ceiling (bounded; it stops at hasMore=false).
    const maxPages = vendor === 'HIKVISION' ? MAX_PAGES : 600;

    for (let page = 0; page < maxPages; page++) {
      const res = await adapter.fetchLogs(model, { ...windowCursor, lastLogIndex: position });
      const events = res.events ?? [];
      for (const ev of events) {
        const recordId = ev.vendorEventId || '';
        if (recordId && seenRecordIds.has(recordId)) continue;
        if (recordId) seenRecordIds.add(recordId);
        const d = new Date(ev.deviceTime);
        if (isNaN(d.getTime())) continue;
        const eventDate = d.toISOString().slice(0, 10);
        if (eventDate < fromDate || eventDate > toDate) continue;
        collected.push(ev);
        if (collected.length >= MAX_EVENTS) return collected;
      }
      if (!res.hasMore) break;
      // Advance the position. Prefer the adapter's reported cursor (Suprema jumps
      // by the raw log id, which can leap past non-punch events a page may hold);
      // otherwise step by the page size. Stop if nothing advanced, so a page that
      // yielded 0 PUNCH events (e.g. only door/boot events) does NOT end the scan.
      const nextIdx = res.nextCursor?.lastLogIndex;
      const advanced =
        typeof nextIdx === 'number' && nextIdx > position ? nextIdx : position + events.length;
      if (advanced <= position) break;
      position = advanced;
    }
    return collected;
  }

  private async normalizeCandidate(
    device: DeviceEntity,
    ev: RawAttendanceEvent,
    rowId: string,
  ): Promise<SyncCandidate | null> {
    const issues: SyncRowIssue[] = [];
    const vendorUserId = ev.vendorUserId;
    // Non-identity access events (door relay, exit button, remote unlock, etc.)
    // carry no enrolled user — skip them so they never surface as bogus
    // EMP-<serial> rows. This mirrors the automatic sync's identity filter.
    if (!vendorUserId || vendorUserId === 'UNKNOWN_USER') return null;

    const deviceTime = new Date(ev.deviceTime);
    const validTime = !isNaN(deviceTime.getTime());
    const punchTimeUtc = validTime ? deviceTime.toISOString() : '';
    const eventDate = validTime ? punchTimeUtc.slice(0, 10) : '';

    if (!validTime)
      issues.push({ field: 'punchTime', level: 'error', message: 'Invalid device timestamp' });

    const normalizedPunch = normalizePunchType(device.vendor, ev.vendorPunchType);
    const punchType = normalizedPunch === PunchType.UNKNOWN ? PunchType.IN : normalizedPunch;
    const verificationType = normalizeVerificationType(device.vendor, ev.vendorVerificationType);

    const mapping = vendorUserId
      ? await this.mappingRepo.findMapping(device.id, vendorUserId)
      : null;
    const externalEmployeeId = mapping
      ? mapping.external_employee_id
      : `EMP-${(vendorUserId || '0').padStart(4, '0')}`;
    const mapped = Boolean(mapping);
    if (!mapped && vendorUserId) {
      issues.push({
        field: 'employee',
        level: 'warning',
        message: `Vendor id ${vendorUserId} is not mapped to an employee (will import as ${externalEmployeeId})`,
      });
    }

    let employeeName: string | null = null;
    let cardNo: string | null = (ev.metadata?.['cardNo'] as string) || null;
    if (mapping?.metadata) {
      const meta =
        typeof mapping.metadata === 'string'
          ? (JSON.parse(mapping.metadata) as Record<string, unknown>)
          : (mapping.metadata as Record<string, unknown>);
      employeeName = (meta['employeeName'] as string) || null;
      cardNo = cardNo || (meta['cardNo'] as string) || null;
    }

    const fingerprint =
      vendorUserId && validTime
        ? generateEventFingerprint({
            organizationId: ORG_CODE,
            employeeId: externalEmployeeId,
            deviceId: device.device_code,
            punchTimeUtc,
            punchType,
          })
        : '';

    return {
      rowId,
      vendorUserId: vendorUserId || '',
      externalEmployeeId,
      employeeName,
      mapped,
      deviceRecordId: ev.vendorEventId || '',
      punchTimeUtc,
      punchTimeLocal: validTime ? deviceTime.toLocaleString('en-US') : '',
      eventDate,
      punchType,
      verificationType,
      cardNo,
      fingerprint,
      level: 'valid',
      alreadySynced: false,
      duplicateInBatch: false,
      willImport: false,
      issues,
    };
  }

  /** Looks up which candidates already exist in attendance_logs for this device,
   *  keyed by vendor_event_id (punchType-independent) and by fingerprint. */
  private async loadExisting(
    deviceId: number,
    candidates: SyncCandidate[],
  ): Promise<{ byRecordId: Set<string>; byFingerprint: Set<string> }> {
    const byRecordId = new Set<string>();
    const byFingerprint = new Set<string>();
    const recordIds = [...new Set(candidates.map((c) => c.deviceRecordId).filter(Boolean))];
    const fingerprints = [...new Set(candidates.map((c) => c.fingerprint).filter(Boolean))];

    if (recordIds.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (await this.db.query<any[]>(
        `SELECT DISTINCT vendor_event_id FROM attendance_logs
         WHERE device_id = ? AND vendor_event_id IN (${recordIds.map(() => '?').join(',')})`,
        [deviceId, ...recordIds],
      )) as Array<{ vendor_event_id: string }>;
      for (const r of rows) if (r.vendor_event_id) byRecordId.add(r.vendor_event_id);
    }
    if (fingerprints.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (await this.db.query<any[]>(
        `SELECT DISTINCT event_fingerprint FROM attendance_logs
         WHERE event_fingerprint IN (${fingerprints.map(() => '?').join(',')})`,
        fingerprints,
      )) as Array<{ event_fingerprint: string }>;
      for (const r of rows) if (r.event_fingerprint) byFingerprint.add(r.event_fingerprint);
    }
    return { byRecordId, byFingerprint };
  }

  private applyLevel(c: SyncCandidate): void {
    const hasError = c.issues.some((i) => i.level === 'error');
    if (hasError) {
      c.level = 'error';
      c.willImport = false;
      return;
    }
    if (c.alreadySynced) {
      c.level = 'warning';
      c.issues.push({
        field: 'duplicate',
        level: 'warning',
        message: 'Already present in the database — will be skipped',
      });
      c.willImport = false;
      return;
    }
    if (c.duplicateInBatch) {
      c.level = 'warning';
      c.issues.push({
        field: 'duplicate',
        level: 'warning',
        message: 'Duplicate of another row in this batch — will be skipped',
      });
      c.willImport = false;
      return;
    }
    c.level = c.issues.some((i) => i.level === 'warning') ? 'warning' : 'valid';
    c.willImport = true;
  }

  private summarize(candidates: SyncCandidate[]): ManualSyncFetchResult['summary'] {
    let valid = 0;
    let warnings = 0;
    let errors = 0;
    let duplicatesInBatch = 0;
    let alreadySynced = 0;
    let willImport = 0;
    for (const c of candidates) {
      if (c.level === 'error') errors++;
      else if (c.level === 'warning') warnings++;
      else valid++;
      if (c.duplicateInBatch) duplicatesInBatch++;
      if (c.alreadySynced) alreadySynced++;
      if (c.willImport) willImport++;
    }
    return {
      total: candidates.length,
      valid,
      warnings,
      errors,
      duplicatesInBatch,
      alreadySynced,
      willImport,
    };
  }

  /** Persists one candidate as a MANUAL attendance row (idempotent) + outbox. */
  private async commitRow(
    device: DeviceEntity,
    row: ManualSyncCommitRowDto,
    deviceTime: Date,
    jobId: number,
  ): Promise<ManualSyncCommitResult['results'][number]> {
    const vendorUserId = row.vendorUserId;
    const eventDate = deviceTime.toISOString().slice(0, 10)!;
    const punchTimeUtc = deviceTime.toISOString();

    const mapping = await this.mappingRepo.findMapping(device.id, vendorUserId);
    const externalEmployeeId = mapping
      ? mapping.external_employee_id
      : `EMP-${vendorUserId.padStart(4, '0')}`;

    const normalizedPunch = normalizePunchType(device.vendor, row.punchType);
    const punchType = normalizedPunch === PunchType.UNKNOWN ? PunchType.IN : normalizedPunch;
    const verificationType = normalizeVerificationType(device.vendor, row.verificationType);

    const fingerprint = generateEventFingerprint({
      organizationId: ORG_CODE,
      employeeId: externalEmployeeId,
      deviceId: device.device_code,
      punchTimeUtc,
      punchType,
    });

    // Cross-path guard: skip if this device record is already stored (regardless
    // of how punchType normalized), so manual commit never shadows an auto row.
    if (row.deviceRecordId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing = (await this.db.query<any[]>(
        'SELECT COUNT(*) AS c FROM attendance_logs WHERE device_id = ? AND vendor_event_id = ?',
        [device.id, row.deviceRecordId],
      )) as Array<{ c: number }>;
      if ((existing[0]?.c ?? 0) > 0) {
        return {
          externalEmployeeId,
          deviceRecordId: row.deviceRecordId,
          status: 'duplicate',
          message: 'Device record already present in attendance_logs',
        };
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawLogRes = await this.db.query<any>(
      `INSERT INTO raw_punch_logs (
        event_date, organization_id, device_id, vendor, vendor_event_id,
        vendor_user_id, device_time, received_at, raw_payload, payload_hash, normalization_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6), ?, ?, 'PROCESSED')`,
      [
        eventDate,
        device.organization_id,
        device.id,
        device.vendor,
        row.deviceRecordId || randomUUID(),
        vendorUserId,
        deviceTime,
        JSON.stringify({ manualSync: true, userName: row.userName, cardNo: row.cardNo }),
        fingerprint,
      ],
    );
    const rawLogId = rawLogRes.insertId || 1;

    const eventValue: Record<string, unknown> = {
      eventId: randomUUID(),
      schemaVersion: 1,
      organizationId: ORG_CODE,
      branchId: device.branch_id ?? null,
      employeeId: externalEmployeeId,
      deviceId: device.device_code,
      vendor: device.vendor,
      punchTime: punchTimeUtc,
      punchTimeUtc,
      receivedAt: new Date().toISOString(),
      punchType,
      verificationType,
      source: 'PULL',
      syncMode: 'MANUAL',
      syncJobId: jobId,
      eventFingerprint: fingerprint,
      metadata: { manualSync: true, cardNo: row.cardNo, userName: row.userName },
    };

    const result = await runInTransaction(this.db, async (conn) => {
      const r = await this.attendanceRepo.insertIdempotent(
        {
          eventDate,
          organizationId: device.organization_id,
          employeeId: externalEmployeeId,
          deviceId: device.id,
          vendor: device.vendor,
          rawLogId,
          punchTime: deviceTime,
          punchTimeUtc: deviceTime,
          receivedAt: new Date(),
          punchType,
          verificationType,
          source: 'PULL',
          syncMode: 'MANUAL',
          syncJobId: jobId,
          vendorEventId: row.deviceRecordId || '',
          eventFingerprint: fingerprint,
        },
        conn,
      );
      if (r.inserted) {
        await this.outboxRepo.create(
          {
            eventId: fingerprint,
            eventType: WEBHOOK_EVENT_TYPE,
            aggregateType: 'ATTENDANCE',
            aggregateId: device.device_code,
            organizationId: device.organization_id,
            payload: eventValue,
          },
          conn,
        );
      }
      return r;
    });

    return {
      externalEmployeeId,
      deviceRecordId: row.deviceRecordId || '',
      status: result.inserted ? 'imported' : 'duplicate',
      message: result.inserted
        ? 'Imported as a manual attendance record'
        : 'Duplicate fingerprint — already synced',
    };
  }
}
