import { Injectable, Inject, NotFoundException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import {
  DatabaseClient,
  DeviceRepository,
  AttendanceLogRepository,
  DeviceEmployeeMappingRepository,
  OutboxRepository,
  runInTransaction,
  type DeviceEntity,
  type PoolConnection,
} from '@attendance/database';
import { AppLogger } from '@attendance/logging';
import { LOGGER_TOKEN } from '../logging/logging.module.js';
import { ISAPIClient, type HikvisionAcsEventRecord } from '@attendance/adapter-hikvision';
import { SupremaDeviceAdapter } from '@attendance/adapter-suprema';
import { KafkaProducer } from '@attendance/kafka';
import {
  generateEventFingerprint,
  KAFKA_TOPICS,
  PunchType,
  VerificationType,
  normalizePunchType,
  normalizeVerificationType,
  type RawAttendanceEvent,
  type DeviceModel,
  type SyncCursor,
} from '@attendance/contracts';
import { PunchQueryDto, IngestPunchDto } from './dto/punch-query.dto.js';
import { randomUUID } from 'node:crypto';

/** Outbox event type that external webhook subscriptions subscribe to. */
const WEBHOOK_EVENT_TYPE = 'attendance.normalized.v1';

export interface PunchLogItem {
  id: number;
  eventDate: string;
  employeeId: string;
  employeeName: string;
  department: string;
  deviceId: number;
  deviceCode: string;
  deviceName: string;
  vendor: string;
  punchType: string;
  verificationType: string;
  punchTime: string;
  punchTimeUtc: string;
  receivedAt: string;
  source: string;
  syncMode: string; // 'AUTOMATIC' | 'MANUAL'
  syncJobId?: number | null;
  cardNo?: string;
  fingerprint: string;
}

@Injectable()
export class PunchesService implements OnModuleInit, OnModuleDestroy {
  private readonly deviceRepo: DeviceRepository;
  private readonly attendanceRepo: AttendanceLogRepository;
  private readonly mappingRepo: DeviceEmployeeMappingRepository;
  private readonly outboxRepo: OutboxRepository;
  private pollIntervalTimer: NodeJS.Timeout | null = null;
  // Per-device high-water serial so steady-state polls read only the tail of the
  // device log. Rebuilt lazily from the DB after a restart (see getSyncFloor).
  private lastSyncedSerialMap = new Map<number, number>();
  // Re-entrancy guard: a catch-up backfill can span many pages/seconds, and the
  // 1s poller must never stack a second sync on top of one already running.
  private readonly syncInProgress = new Set<number>();

  // Suprema devices stream punches in real time through the G-SDK gateway; we keep
  // one live subscription per online device and persist events as they arrive.
  private readonly supremaAdapter: SupremaDeviceAdapter;
  private readonly supremaSubscriptions = new Map<number, () => void>();
  private supremaSetupTimer: NodeJS.Timeout | null = null;
  // Next G-SDK log id to fetch per Suprema device, for backlog reconciliation on
  // reconnect. Rebuilt lazily from the DB after a restart (see getSupremaCursor).
  private readonly supremaCursor = new Map<number, number>();

  constructor(
    @Inject(DatabaseClient) private readonly db: DatabaseClient,
    @Inject(LOGGER_TOKEN) private readonly logger: AppLogger,
    @Inject(KafkaProducer) private readonly kafkaProducer: KafkaProducer,
  ) {
    this.deviceRepo = new DeviceRepository(this.db);
    this.attendanceRepo = new AttendanceLogRepository(this.db);
    this.mappingRepo = new DeviceEmployeeMappingRepository(this.db);
    this.outboxRepo = new OutboxRepository(this.db);
    this.supremaAdapter = new SupremaDeviceAdapter(this.logger);
  }

  /**
   * Transactional outbox enqueue: writes the normalized event into `outbox_events`
   * in the SAME transaction as the attendance insert, so the real-time webhook
   * dispatcher (ADR-009) delivers it to each company's endpoint. Idempotent — a
   * duplicate fingerprint (e.g. re-sync after a purge) is ignored, not an error.
   */
  private async enqueueWebhookOutbox(
    conn: PoolConnection,
    device: DeviceEntity,
    fingerprint: string,
    eventValue: Record<string, unknown>,
  ): Promise<void> {
    try {
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
    } catch (err: unknown) {
      const errno =
        typeof err === 'object' && err !== null && 'errno' in err
          ? (err as { errno: number }).errno
          : 0;
      if (errno !== 1062) throw err; // 1062 = duplicate event_id → already enqueued
    }
  }

  public onModuleInit() {
    this.startBackgroundPoller();
    this.startSupremaRealtime();
  }

  public onModuleDestroy() {
    if (this.pollIntervalTimer) {
      clearInterval(this.pollIntervalTimer);
      this.pollIntervalTimer = null;
    }
    if (this.supremaSetupTimer) {
      clearInterval(this.supremaSetupTimer);
      this.supremaSetupTimer = null;
    }
    for (const unsubscribe of this.supremaSubscriptions.values()) {
      try {
        unsubscribe();
      } catch {
        // best effort
      }
    }
    this.supremaSubscriptions.clear();
    this.supremaAdapter.close();
  }

  /**
   * Keeps a live G-SDK subscription open for every online Suprema device so that
   * physical punches land in the Live Punch Stream in real time.
   */
  private startSupremaRealtime() {
    const reconcile = () => {
      void this.ensureSupremaSubscriptions();
    };
    reconcile();
    this.supremaSetupTimer = setInterval(reconcile, 15000);
  }

  private async ensureSupremaSubscriptions(): Promise<void> {
    let devices: DeviceEntity[] = [];
    try {
      devices = await this.deviceRepo.listByOrg(1);
    } catch {
      return;
    }

    // Attempt to stream from every Suprema device that isn't manually stopped —
    // including ones currently OFFLINE, so they auto-recover to ONLINE the moment
    // the terminal is reachable again. (STOPPED/DISABLED/MAINTENANCE are left alone.)
    const manuallyHalted = new Set(['STOPPED', 'DISABLED', 'MAINTENANCE']);
    const onlineSuprema = devices.filter(
      (d) => d.vendor === 'SUPREMA' && !manuallyHalted.has(String(d.status ?? '').toUpperCase()),
    );
    const onlineIds = new Set(onlineSuprema.map((d) => d.id));

    // Drop subscriptions for devices that are gone or no longer online.
    for (const [deviceId, unsubscribe] of this.supremaSubscriptions.entries()) {
      if (!onlineIds.has(deviceId)) {
        try {
          unsubscribe();
        } catch {
          // best effort
        }
        this.supremaSubscriptions.delete(deviceId);
      }
    }

    // Subscribe to any online Suprema device we are not already streaming.
    for (const device of onlineSuprema) {
      if (this.supremaSubscriptions.has(device.id)) continue;
      // Reserve the slot immediately so a slow subscribe does not get duplicated.
      this.supremaSubscriptions.set(device.id, () => {});
      try {
        const deviceModel = this.toDeviceModel(device);
        // Before opening the real-time stream, drain any punches the terminal
        // buffered while it was unreachable. Done sequentially (never concurrently
        // with the monitor stream, which shares the single G-SDK connection) and
        // strictly best-effort: any failure here must not stop the subscription
        // from opening, so the live stream behaves exactly as before.
        try {
          await this.reconcileSupremaBacklog(device, deviceModel);
        } catch (err: unknown) {
          this.logger.warn(
            { deviceId: device.id, error: err instanceof Error ? err.message : String(err) },
            'Suprema backlog reconciliation failed (continuing to real-time subscribe)',
          );
        }
        const unsubscribe = await this.supremaAdapter.subscribe(
          deviceModel,
          async (event) => {
            await this.persistSupremaPunch(device, event);
          },
          undefined,
          // Gateway pushes connect/disconnect transitions -> reflect live status.
          (connected) => {
            void this.updateDeviceStatus(device.id, connected);
            if (!connected) {
              // Drop the held subscription so the reconcile loop re-establishes a
              // fresh connection; the terminal then flips back to ONLINE on its own
              // once it's reachable again (direct connections aren't auto-redialed).
              this.scheduleSupremaResubscribe(device.id);
            }
          },
        );
        this.supremaSubscriptions.set(device.id, unsubscribe);
        // Subscription established -> the terminal is reachable.
        void this.updateDeviceStatus(device.id, true);
        this.logger.info(
          { deviceId: device.id, deviceCode: device.device_code },
          'Opened Suprema G-SDK real-time subscription for Live Punch Stream',
        );
      } catch (err: unknown) {
        this.supremaSubscriptions.delete(device.id);
        // Could not open the stream -> the terminal is unreachable (offline).
        void this.updateDeviceStatus(device.id, false);
        this.logger.warn(
          { deviceId: device.id, error: err instanceof Error ? err.message : String(err) },
          'Failed to open Suprema real-time subscription (will retry)',
        );
      }
    }
  }

  /**
   * Tears down a Suprema subscription after a disconnect so the reconcile loop
   * re-subscribes it with a fresh connection. Deferred so we never stop the
   * consumer from inside its own status handler.
   */
  private scheduleSupremaResubscribe(deviceId: number): void {
    setTimeout(() => {
      const unsubscribe = this.supremaSubscriptions.get(deviceId);
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch {
          // best effort
        }
        this.supremaSubscriptions.delete(deviceId);
      }
    }, 0);
  }

  /**
   * Persists a device's live connection status (ONLINE/OFFLINE) + last-seen.
   * Driven passively by the real-time subscription — never opens a new
   * connection — and swallows errors so status writes can never break streaming.
   */
  private async updateDeviceStatus(deviceId: number, connected: boolean): Promise<void> {
    try {
      await this.deviceRepo.updateStatus(deviceId, connected ? 'ONLINE' : 'OFFLINE', new Date());
    } catch {
      // best effort — status reporting must not disrupt the punch stream
    }
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
      createdAt: device.created_at ? new Date(device.created_at).toISOString() : new Date().toISOString(),
      updatedAt: device.updated_at ? new Date(device.updated_at).toISOString() : new Date().toISOString(),
    };
  }

  /**
   * Persists a normalized Suprema real-time punch into raw_punch_logs + attendance_logs
   * (idempotent) and republishes it on attendance.normalized.v1.
   */
  private async persistSupremaPunch(device: DeviceEntity, event: RawAttendanceEvent): Promise<void> {
    try {
      const rawVendorUserId = event.vendorUserId;
      if (!rawVendorUserId || rawVendorUserId === 'UNKNOWN_USER') return;

      const deviceTime = new Date(event.deviceTime);
      if (isNaN(deviceTime.getTime())) return;
      const eventDate = deviceTime.toISOString().split('T')[0]!;
      const punchTimeUtc = deviceTime.toISOString();

      const normalizedPunch = normalizePunchType('SUPREMA', event.vendorPunchType);
      const punchType = normalizedPunch === PunchType.UNKNOWN ? PunchType.IN : normalizedPunch;
      const verificationType = normalizeVerificationType('SUPREMA', event.vendorVerificationType);

      const mapping = await this.mappingRepo.findMapping(device.id, rawVendorUserId);
      const externalEmployeeId = mapping
        ? mapping.external_employee_id
        : `EMP-${rawVendorUserId.padStart(4, '0')}`;

      const fingerprint = generateEventFingerprint({
        organizationId: 'ORG-TECHIVE',
        employeeId: externalEmployeeId,
        deviceId: device.device_code,
        punchTimeUtc,
        punchType,
      });

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
          event.vendorEventId || randomUUID(),
          rawVendorUserId,
          deviceTime,
          JSON.stringify(event.rawPayload ?? {}),
          fingerprint,
        ],
      );
      const rawLogId = rawLogRes.insertId || 1;

      const eventValue: Record<string, unknown> = {
        eventId: randomUUID(),
        schemaVersion: 1,
        organizationId: 'ORG-TECHIVE',
        branchId: device.branch_id ?? null,
        employeeId: externalEmployeeId,
        deviceId: device.device_code,
        vendor: device.vendor,
        punchTime: deviceTime.toISOString(),
        punchTimeUtc,
        receivedAt: new Date().toISOString(),
        punchType,
        verificationType,
        source: event.source || 'REALTIME',
        eventFingerprint: fingerprint,
        metadata: { realtime: true },
      };

      // Persist attendance + enqueue the outbox webhook event atomically.
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
            source: event.source || 'REALTIME',
            vendorEventId: event.vendorEventId || '',
            eventFingerprint: fingerprint,
          },
          conn,
        );
        if (r.inserted) {
          await this.enqueueWebhookOutbox(conn, device, fingerprint, eventValue);
        }
        return r;
      });

      if (result.inserted) {
        try {
          await this.kafkaProducer.publish({
            topic: KAFKA_TOPICS.ATTENDANCE_NORMALIZED,
            key: device.device_code,
            value: eventValue,
          });
        } catch {
          // Kafka publish is best-effort; the punch is already persisted.
        }
        this.logger.info(
          {
            deviceCode: device.device_code,
            employeeId: externalEmployeeId,
            punchType,
            verificationType,
            punchTimeUtc,
          },
          'Live Suprema punch persisted',
        );
      }
    } catch (err: unknown) {
      this.logger.warn(
        { deviceId: device.id, error: err instanceof Error ? err.message : String(err) },
        'Failed to persist Suprema real-time punch',
      );
    }
  }

  /**
   * Returns the G-SDK log id to resume backlog reconciliation from for a Suprema
   * device. Prefers the in-memory cursor; after a restart it is rebuilt from the
   * highest log id already stored (Suprema vendor_event_id is "deviceID:logID"),
   * so a restart resumes near the real boundary instead of re-scanning the whole
   * on-board log. Returns an inclusive start — any re-fetched event is de-duped.
   */
  private async getSupremaCursor(deviceId: number): Promise<number> {
    const cached = this.supremaCursor.get(deviceId);
    if (cached !== undefined) return cached;
    let start = 0;
    try {
      const rows = (await this.db.query(
        `SELECT MAX(CAST(SUBSTRING_INDEX(vendor_event_id, ':', -1) AS UNSIGNED)) AS maxId
         FROM raw_punch_logs
         WHERE device_id = ? AND vendor_event_id LIKE '%:%'`,
        [deviceId],
      )) as Array<{ maxId: number | string | null }>;
      const raw = Array.isArray(rows) && rows[0] ? rows[0].maxId : null;
      start = raw != null ? Number(raw) || 0 : 0;
    } catch {
      start = 0;
    }
    this.supremaCursor.set(deviceId, start);
    return start;
  }

  /**
   * Drains punches a Suprema terminal buffered while it was unreachable, by
   * paging the device log forward from the saved cursor until there is no more.
   * Each event is persisted through the same idempotent path as real-time punches
   * (fingerprint UNIQUE + outbox-on-insert), so overlap with the live stream or a
   * previous run creates no duplicate rows and fires no duplicate webhooks.
   *
   * Runs sequentially before the real-time subscription opens (never concurrently
   * on the shared G-SDK connection). Bounded by MAX_BATCHES per connect; any
   * remainder is drained on the next reconnect.
   */
  private async reconcileSupremaBacklog(
    device: DeviceEntity,
    deviceModel: DeviceModel,
  ): Promise<void> {
    const MAX_BATCHES = 500;
    let cursor: SyncCursor = { lastLogIndex: await this.getSupremaCursor(device.id) };
    let batches = 0;
    let recovered = 0;

    for (;;) {
      const res = await this.supremaAdapter.fetchLogs(deviceModel, cursor);
      batches++;

      for (const ev of res.events) {
        await this.persistSupremaPunch(device, ev);
        recovered++;
      }

      const nextIndex = res.nextCursor?.lastLogIndex;
      if (typeof nextIndex === 'number') {
        this.supremaCursor.set(device.id, nextIndex);
      }

      if (!res.hasMore) break;
      if (batches >= MAX_BATCHES) {
        this.logger.warn(
          { deviceId: device.id, batches, recovered },
          'Suprema backlog reconcile hit the batch cap; remainder will drain on the next reconnect',
        );
        break;
      }
      // Guard against a cursor that fails to advance (never loop forever).
      if (typeof nextIndex !== 'number' || nextIndex <= (cursor.lastLogIndex ?? 0)) break;
      cursor = res.nextCursor ?? cursor;
    }

    if (recovered > 0) {
      this.logger.info(
        { deviceId: device.id, deviceCode: device.device_code, recovered, batches },
        'Reconciled Suprema buffered punches on connect',
      );
    }
  }

  private startBackgroundPoller() {
    // Automatically poll real devices every 1 second so punches show up on the live stream immediately!
    this.pollIntervalTimer = setInterval(async () => {
      try {
        const devices = await this.deviceRepo.listByOrg(1);
        const onlineHik = devices.find((d) => d.vendor === 'HIKVISION' && d.status === 'ONLINE');
        if (onlineHik) {
          await this.syncFromDevice(onlineHik.id);
        }
      } catch {
        // background poll non-blocking
      }
    }, 1000);
  }

  public async getHistoricalLogs(query: PunchQueryDto): Promise<{
    items: PunchLogItem[];
    total: number;
    nextCursor?: { punchTimeUtc: string; id: number };
  }> {
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (query.employeeId) {
      conditions.push('a.employee_id = ?');
      params.push(query.employeeId);
    }
    if (query.deviceId) {
      conditions.push('a.device_id = ?');
      params.push(query.deviceId);
    }
    if (query.deviceCode) {
      conditions.push('d.device_code = ?');
      params.push(query.deviceCode);
    }
    if (query.date) {
      conditions.push('a.event_date = ?');
      params.push(query.date);
    }

    if (query.search) {
      const s = `%${query.search.trim()}%`;
      conditions.push(
        '(a.employee_id LIKE ? OR a.event_fingerprint LIKE ? OR d.device_code LIKE ? OR m.external_employee_id LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(m.metadata, "$.employeeName")) LIKE ?)',
      );
      params.push(s, s, s, s, s);
    }

    // Snapshot the filter clause (without the keyset cursor) so we can return an
    // accurate total count of all matching rows, not just the current page.
    const filterConditions = [...conditions];
    const filterParams = [...params];

    if (query.cursorTime && query.cursorId) {
      conditions.push('(a.punch_time_utc < ? OR (a.punch_time_utc = ? AND a.id < ?))');
      params.push(query.cursorTime, query.cursorTime, query.cursorId);
    }

    const limit = Math.min(query.limit || 50, 100);

    const sql = `
      SELECT 
        a.id,
        a.event_date,
        a.employee_id,
        a.device_id,
        a.vendor,
        a.punch_type,
        a.verification_type,
        a.punch_time,
        a.punch_time_utc,
        a.received_at,
        a.source,
        a.sync_mode,
        a.sync_job_id,
        a.event_fingerprint,
        d.device_code,
        d.name AS device_name,
        m.metadata AS mapping_metadata
      FROM attendance_logs a
      LEFT JOIN devices d ON d.id = a.device_id
      LEFT JOIN device_employee_mappings m ON (m.device_id = a.device_id AND m.external_employee_id = a.employee_id)
      WHERE ${conditions.join(' AND ')}
      ORDER BY a.punch_time_utc DESC, a.id DESC
      LIMIT ?
    `;

    params.push(limit + 1);

    const rows = await this.db.query<any[]>(sql, params);
    const hasMore = rows.length > limit;
    const records = hasMore ? rows.slice(0, limit) : rows;

    const items: PunchLogItem[] = records.map((r) => {
      let meta: Record<string, unknown> = {};
      if (r.mapping_metadata) {
        meta = typeof r.mapping_metadata === 'string' ? JSON.parse(r.mapping_metadata) : r.mapping_metadata;
      }
      const eventDate = r.event_date ? new Date(r.event_date).toISOString().split('T')[0]! : new Date().toISOString().split('T')[0]!;
      return {
        id: r.id,
        eventDate,
        employeeId: r.employee_id,
        employeeName: (meta['employeeName'] as string) || `Employee ${r.employee_id}`,
        department: (meta['department'] as string) || 'General Operations',
        deviceId: r.device_id,
        deviceCode: r.device_code || `DEV-${r.device_id}`,
        deviceName: r.device_name || 'Biometric Terminal',
        vendor: (r.vendor || 'HIKVISION').toUpperCase(),
        punchType: r.punch_type || 'IN',
        verificationType: r.verification_type || 'FACE',
        punchTime: r.punch_time ? new Date(r.punch_time).toLocaleString() : '',
        punchTimeUtc: r.punch_time_utc ? new Date(r.punch_time_utc).toISOString() : '',
        receivedAt: r.received_at ? new Date(r.received_at).toISOString() : '',
        source: r.source || 'PUSH',
        syncMode: r.sync_mode || 'AUTOMATIC',
        syncJobId: r.sync_job_id ?? null,
        cardNo: (meta['cardNo'] as string) || undefined,
        fingerprint: r.event_fingerprint || '',
      };
    });

    let nextCursor: { punchTimeUtc: string; id: number } | undefined = undefined;
    if (hasMore && items.length > 0) {
      const last = items[items.length - 1]!;
      nextCursor = {
        punchTimeUtc: last.punchTimeUtc,
        id: last.id,
      };
    }

    // Accurate total of all rows matching the filters (ignores the keyset cursor).
    let total = items.length;
    try {
      const countRows = await this.db.query<any[]>(
        `SELECT COUNT(*) AS n
         FROM attendance_logs a
         LEFT JOIN devices d ON d.id = a.device_id
         LEFT JOIN device_employee_mappings m ON (m.device_id = a.device_id AND m.external_employee_id = a.employee_id)
         WHERE ${filterConditions.join(' AND ')}`,
        filterParams,
      );
      total = Number(countRows[0]?.['n'] ?? items.length);
    } catch {
      /* fall back to page length */
    }

    return {
      items,
      total,
      nextCursor,
    };
  }

  public async getLiveFeed(limit = 25): Promise<PunchLogItem[]> {
    const res = await this.getHistoricalLogs({ limit });
    return res.items;
  }

  public async syncFromDevice(deviceIdOrCode: string | number): Promise<{
    success: boolean;
    syncedCount: number;
    newCount: number;
    duplicateCount: number;
    deviceCode: string;
    events: PunchLogItem[];
  }> {
    let device: DeviceEntity | null = null;
    if (typeof deviceIdOrCode === 'number') {
      device = await this.deviceRepo.findById(deviceIdOrCode);
    } else {
      const parsedId = parseInt(deviceIdOrCode, 10);
      if (!isNaN(parsedId)) {
        device = await this.deviceRepo.findById(parsedId);
      }
      if (!device) {
        device = await this.deviceRepo.findByOrgAndCode(1, deviceIdOrCode);
      }
    }

    if (!device) {
      throw new NotFoundException(`Device ${deviceIdOrCode} not found in registry`);
    }

    // Never run two syncs for the same device at once — a reconnect backfill can
    // take many seconds and the 1s poller would otherwise stack calls on top of it.
    if (this.syncInProgress.has(device.id)) {
      return {
        success: true,
        syncedCount: 0,
        newCount: 0,
        duplicateCount: 0,
        deviceCode: device.device_code,
        events: await this.getLiveFeed(10),
      };
    }
    this.syncInProgress.add(device.id);
    try {
      return await this.runDeviceSync(device);
    } finally {
      this.syncInProgress.delete(device.id);
    }
  }

  /**
   * Syncs every registered pull-based (Hikvision/ISAPI) terminal, resolving them
   * from the registry instead of a hard-coded device code. Suprema terminals are
   * push + reconcile-on-connect, so they are not pulled here. Returns an aggregate
   * summary plus a per-device breakdown; a failure on one device does not abort
   * the others.
   */
  public async syncAllPullDevices(): Promise<{
    success: boolean;
    deviceCount: number;
    syncedCount: number;
    newCount: number;
    duplicateCount: number;
    deviceCode: string | null;
    message: string;
    results: Array<{
      deviceCode: string;
      success: boolean;
      newCount: number;
      duplicateCount: number;
      error?: string;
    }>;
  }> {
    const devices = await this.deviceRepo.listByOrg(1);
    const pullDevices = devices.filter((d) => d.vendor === 'HIKVISION');

    if (pullDevices.length === 0) {
      return {
        success: true,
        deviceCount: 0,
        syncedCount: 0,
        newCount: 0,
        duplicateCount: 0,
        deviceCode: null,
        message:
          'No pull-based (Hikvision) terminal is registered. Suprema terminals stream in real time and reconcile automatically on reconnect.',
        results: [],
      };
    }

    let newCount = 0;
    let duplicateCount = 0;
    let syncedCount = 0;
    const results: Array<{
      deviceCode: string;
      success: boolean;
      newCount: number;
      duplicateCount: number;
      error?: string;
    }> = [];

    for (const d of pullDevices) {
      try {
        const r = await this.syncFromDevice(d.id);
        newCount += r.newCount;
        duplicateCount += r.duplicateCount;
        syncedCount += r.syncedCount;
        results.push({
          deviceCode: r.deviceCode,
          success: true,
          newCount: r.newCount,
          duplicateCount: r.duplicateCount,
        });
      } catch (err: unknown) {
        results.push({
          deviceCode: d.device_code,
          success: false,
          newCount: 0,
          duplicateCount: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const okCount = results.filter((r) => r.success).length;
    const allOk = okCount === results.length;
    const message = allOk
      ? `Synced ${okCount} terminal(s): ${newCount} new, ${duplicateCount} duplicate(s) rejected.`
      : `Synced ${okCount}/${results.length} terminal(s); ${results.length - okCount} unreachable.`;

    return {
      success: allOk,
      deviceCount: pullDevices.length,
      syncedCount,
      newCount,
      duplicateCount,
      deviceCode: pullDevices.length === 1 ? pullDevices[0]!.device_code : null,
      message,
      results,
    };
  }

  /**
   * Pulls punches from a Hikvision terminal and ingests them idempotently.
   *
   * Catch-up aware: instead of reading only the newest page, it pages BACKWARD
   * from the latest event through the device's on-board buffer until it reaches
   * events that are already stored (or at/below the per-device watermark), so a
   * terminal that was offline for hours, days or weeks backfills every buffered
   * punch the moment it reconnects — bounded only by the device's own log
   * capacity. De-duplication is guaranteed by the `event_fingerprint` UNIQUE
   * constraint (insertIdempotent), so overlapping reads create no duplicate rows
   * and fire no duplicate webhooks.
   */
  private async runDeviceSync(device: DeviceEntity): Promise<{
    success: boolean;
    syncedCount: number;
    newCount: number;
    duplicateCount: number;
    deviceCode: string;
    events: PunchLogItem[];
  }> {
    const host = device.host || '192.168.100.186';
    let port = device.port || 80;
    if (port === 8000) port = 80; // Map SADP 8000 to ISAPI 80

    const meta = device.metadata || {};
    const username = (meta['username'] as string) || 'admin';
    const password = (meta['password'] as string) || 'uno@6488';

    const client = new ISAPIClient(
      {
        host,
        port,
        username,
        password,
        useHttps: false,
        timeoutMs: 8000,
      },
      this.logger,
    );

    const PAGE_SIZE = 30;
    // Safety bound on a single reconnect's catch-up (~30k buffered punches). The
    // page boundary normally stops us long before this; the cap only guards
    // against a pathological loop. Remaining events are picked up on later polls.
    const MAX_BACKFILL_PAGES = 1000;

    // How many events the terminal currently holds in its on-board buffer.
    const countCheck = await client.searchAcsEvents({
      searchID: randomUUID(),
      searchResultPosition: 0,
      maxResults: 1,
      major: 0,
    });
    const totalMatches = countCheck.AcsEvent?.totalMatches || 0;

    // Serial watermark: everything at/below this is already ingested (or was
    // intentionally skipped by a purge). Snapshotted once so it can't drift as we
    // ingest within this pass. Rebuilt from the DB after a restart.
    const floor = await this.getSyncFloor(device.id);

    let newCount = 0;
    let duplicateCount = 0;
    let syncedCount = 0;
    let highestSerial = floor;
    let pagesRead = 0;

    // Page BACKWARD from the newest event through the buffer, stopping as soon as
    // we reach events already stored (fingerprint duplicate) or at/below the
    // watermark. In steady state this reads a single page; after a long outage it
    // walks back far enough to recover every buffered punch.
    let position = Math.max(0, totalMatches - PAGE_SIZE);
    for (;;) {
      const acsRes = await client.searchAcsEvents({
        searchID: randomUUID(),
        searchResultPosition: position,
        maxResults: PAGE_SIZE,
        major: 0,
      });
      pagesRead++;

      const rawList = acsRes.AcsEvent?.InfoList || [];
      // Oldest-first so the first processed event in the page is the oldest.
      rawList.sort((a, b) => (a.serialNo || 0) - (b.serialNo || 0));
      const infoList = rawList.filter(
        (i) => i.employeeNoString || i.name || i.cardNo || i.minor === 75 || i.minor === 38 || i.minor === 1,
      );

      let pageMinSerial = Number.POSITIVE_INFINITY;
      let sawAttempted = false;
      let oldestAttemptedWasDuplicate = false;

      for (const info of infoList) {
        if (!info.time) continue;
        if (info.serialNo) pageMinSerial = Math.min(pageMinSerial, info.serialNo);
        // Skip anything already covered by the watermark (already synced / purged past).
        if (floor > 0 && info.serialNo && info.serialNo <= floor) continue;

        const outcome = await this.ingestHikvisionEvent(device, info);
        if (!outcome.processed) continue; // no employee identity -> not a punch

        syncedCount++;
        if (!sawAttempted) {
          oldestAttemptedWasDuplicate = !outcome.inserted;
          sawAttempted = true;
        }
        if (outcome.inserted) newCount++;
        else duplicateCount++;
        if (info.serialNo && info.serialNo > highestSerial) highestSerial = info.serialNo;
      }

      // --- Stop conditions ---
      if (position === 0) break; // reached the oldest event still in the buffer
      if (pagesRead >= MAX_BACKFILL_PAGES) {
        this.logger.warn(
          { deviceId: device.id, pagesRead },
          'Hikvision backfill hit the page cap; remaining events will sync on the next poll',
        );
        break;
      }
      // Crossed below the watermark -> everything older is already handled.
      if (floor > 0 && pageMinSerial !== Number.POSITIVE_INFINITY && pageMinSerial <= floor) break;
      // Reached already-stored events (oldest punch in this page was a duplicate).
      if (sawAttempted && oldestAttemptedWasDuplicate) break;

      position = Math.max(0, position - PAGE_SIZE);
    }

    // Advance the in-memory watermark so steady-state polls read only the tail.
    if (highestSerial > (this.lastSyncedSerialMap.get(device.id) || 0)) {
      this.lastSyncedSerialMap.set(device.id, highestSerial);
    }

    // Update device status
    await this.deviceRepo.update(device.id, {
      status: 'ONLINE',
    });

    const recentFeed = await this.getLiveFeed(10);

    return {
      success: true,
      syncedCount,
      newCount,
      duplicateCount,
      deviceCode: device.device_code,
      events: recentFeed,
    };
  }

  /**
   * Returns the per-device serial watermark used to bound catch-up. Prefers the
   * in-memory value; after a process restart (empty map) it is rebuilt from the
   * highest serial already persisted for the device, so a restart resumes at the
   * real boundary instead of re-scanning the whole on-board buffer.
   */
  private async getSyncFloor(deviceId: number): Promise<number> {
    const cached = this.lastSyncedSerialMap.get(deviceId);
    if (cached !== undefined) return cached;
    let floor = 0;
    try {
      const rows = (await this.db.query(
        `SELECT MAX(CAST(vendor_event_id AS UNSIGNED)) AS maxSerial
         FROM raw_punch_logs WHERE device_id = ?`,
        [deviceId],
      )) as Array<{ maxSerial: number | string | null }>;
      const raw = Array.isArray(rows) && rows[0] ? rows[0].maxSerial : null;
      floor = raw != null ? Number(raw) || 0 : 0;
    } catch {
      floor = 0;
    }
    this.lastSyncedSerialMap.set(deviceId, floor);
    return floor;
  }

  /**
   * Normalizes and idempotently persists a single Hikvision ACS event.
   * De-duplication is enforced by the `event_fingerprint` UNIQUE constraint, and
   * the webhook outbox row is enqueued in the SAME transaction only when the
   * attendance row is actually inserted — so replaying an already-seen event is a
   * no-op (no duplicate row, no duplicate webhook).
   *
   * Returns `processed=false` for non-punch records (door relay, system events
   * with no employee identity); otherwise `inserted` reflects whether this was a
   * brand-new punch (true) or an already-stored duplicate (false).
   */
  private async ingestHikvisionEvent(
    device: DeviceEntity,
    info: HikvisionAcsEventRecord,
  ): Promise<{ processed: boolean; inserted: boolean }> {
    // Extract raw vendor employee ID from event identity attributes.
    const rawVendorUserId = info.employeeNoString || (info.name === 'amare' ? '2' : info.cardNo);
    // No employee identity (e.g. door relay unlock or invalid system event) -> not a punch.
    if (!rawVendorUserId || !info.time) return { processed: false, inserted: false };

    const deviceTime = new Date(info.time);
    const eventDate = deviceTime.toISOString().split('T')[0]!;
    const punchTimeUtc = deviceTime.toISOString();

    // Resolve employee mapping on this device.
    const mapping = await this.mappingRepo.findMapping(device.id, rawVendorUserId);
    const externalEmployeeId = mapping
      ? mapping.external_employee_id
      : `EMP-${rawVendorUserId.padStart(4, '0')}`;

    // Map verification mode accurately by ISAPI minor code first, then payload attributes.
    let verificationType: VerificationType = VerificationType.FACE;
    const verifyModeStr = (info.currentVerifyMode || '').toLowerCase();

    if (info.minor === 38 || info.minor === 39 || verifyModeStr === 'fingerprint' || verifyModeStr === 'fp') {
      verificationType = VerificationType.FINGERPRINT;
    } else if (info.minor === 1 || info.minor === 2 || info.minor === 5 || verifyModeStr === 'card') {
      verificationType = VerificationType.CARD;
    } else if (info.minor === 75 || info.minor === 76 || Boolean((info as any).FaceRect) || verifyModeStr === 'face') {
      verificationType = VerificationType.FACE;
    } else if (verifyModeStr.includes('finger') || verifyModeStr.includes('fp')) {
      verificationType = VerificationType.FINGERPRINT;
    } else if (verifyModeStr.includes('card') || info.cardNo) {
      verificationType = VerificationType.CARD;
    }

    // Map punch type.
    let punchType: PunchType = PunchType.IN;
    if (info.minor === 75 || info.minor === 38 || info.minor === 21 || info.minor === 1) {
      punchType = PunchType.IN;
    } else if (info.minor === 76 || info.minor === 39 || info.minor === 22) {
      punchType = PunchType.OUT;
    }

    const fingerprint = generateEventFingerprint({
      organizationId: 'ORG-TECHIVE',
      employeeId: externalEmployeeId,
      deviceId: device.device_code,
      punchTimeUtc,
      punchType,
    });

    // Insert raw punch log.
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
        String(info.serialNo || randomUUID()),
        rawVendorUserId,
        deviceTime,
        JSON.stringify(info),
        fingerprint,
      ],
    );

    const rawLogId = rawLogRes.insertId || 1;

    const eventValue: Record<string, unknown> = {
      eventId: randomUUID(),
      schemaVersion: 1,
      organizationId: 'ORG-TECHIVE',
      branchId: device.branch_id ?? null,
      employeeId: externalEmployeeId,
      deviceId: device.device_code,
      vendor: device.vendor,
      punchTime: deviceTime.toISOString(),
      punchTimeUtc,
      receivedAt: new Date().toISOString(),
      punchType,
      verificationType,
      source: 'PULL',
      eventFingerprint: fingerprint,
      metadata: {
        hardwareSerial: device.serial_number,
        doorNo: info.doorNo,
        cardNo: info.cardNo,
        userName: info.name,
      },
    };

    // Idempotently insert into attendance_logs + enqueue the outbox event atomically.
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
          vendorEventId: String(info.serialNo || ''),
          eventFingerprint: fingerprint,
        },
        conn,
      );
      if (r.inserted) {
        await this.enqueueWebhookOutbox(conn, device, fingerprint, eventValue);
      }
      return r;
    });

    if (result.inserted) {
      // Publish to Kafka topic attendance.normalized.v1
      try {
        await this.kafkaProducer.publish({
          topic: KAFKA_TOPICS.ATTENDANCE_NORMALIZED,
          key: device.device_code,
          value: eventValue,
        });
      } catch {
        // Kafka emission fallback
      }
    }

    return { processed: true, inserted: result.inserted };
  }

  public async ingestSimulatedPunch(dto: IngestPunchDto): Promise<PunchLogItem> {
    const orgId = 1;
    let device: DeviceEntity | null = await this.deviceRepo.findByOrgAndCode(orgId, dto.deviceCode || 'DEV-HQ-HIK01');
    if (!device) {
      const list = await this.deviceRepo.listByOrg(orgId);
      device = list[0] ?? null;
    }
    if (!device) {
      throw new NotFoundException('No active terminal found for punch simulation');
    }

    const externalEmployeeId = dto.employeeId || 'EMP-1001';
    const now = new Date();
    const eventDate = now.toISOString().split('T')[0]!;
    const punchTimeUtc = now.toISOString();
    const punchType = (dto.punchType as PunchType) || PunchType.IN;
    const verificationType = (dto.verificationType as VerificationType) || VerificationType.FACE;

    const fingerprint = generateEventFingerprint({
      organizationId: 'ORG-TECHIVE',
      employeeId: externalEmployeeId,
      deviceId: device.device_code,
      punchTimeUtc,
      punchType,
    });

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
        randomUUID(),
        dto.vendorUserId || '1001',
        now,
        JSON.stringify({ simulated: true, cardNo: dto.cardNo }),
        fingerprint,
      ],
    );

    const rawLogId = rawLogRes.insertId || 1;

    const attRecord = await this.attendanceRepo.insertIdempotent({
      eventDate,
      organizationId: device.organization_id,
      employeeId: externalEmployeeId,
      deviceId: device.id,
      vendor: device.vendor,
      rawLogId,
      punchTime: now,
      punchTimeUtc: now,
      receivedAt: now,
      punchType,
      verificationType,
      source: dto.source || 'PUSH',
      vendorEventId: randomUUID(),
      eventFingerprint: fingerprint,
    });

    // Publish to Kafka topic attendance.normalized.v1
    try {
      await this.kafkaProducer.publish({
        topic: KAFKA_TOPICS.ATTENDANCE_NORMALIZED,
        key: device.device_code,
        value: {
          eventId: randomUUID(),
          schemaVersion: 1,
          organizationId: 'ORG-TECHIVE',
          employeeId: externalEmployeeId,
          deviceId: device.device_code,
          vendor: device.vendor,
          punchTime: now.toISOString(),
          punchTimeUtc,
          receivedAt: now.toISOString(),
          punchType,
          verificationType,
          source: dto.source || 'PUSH',
          eventFingerprint: fingerprint,
          metadata: { cardNo: dto.cardNo },
        },
      });
    } catch {
      // Kafka fallback
    }

    return {
      id: attRecord?.id || rawLogId,
      eventDate,
      employeeId: externalEmployeeId,
      employeeName: externalEmployeeId === 'EMP-1001' ? 'Sarah Jenkins' : `Employee ${externalEmployeeId}`,
      department: 'Engineering & Biometrics',
      deviceId: device.id,
      deviceCode: device.device_code,
      deviceName: device.name,
      vendor: device.vendor,
      punchType,
      verificationType,
      punchTime: now.toLocaleString(),
      punchTimeUtc,
      receivedAt: now.toISOString(),
      source: dto.source || 'PUSH',
      syncMode: 'AUTOMATIC',
      cardNo: dto.cardNo,
      fingerprint,
    };
  }

  public async handleHikvisionPush(payload: any): Promise<{ received: boolean; count: number }> {
    const rawData = typeof payload === 'string' ? JSON.parse(payload) : payload;
    const acsEvent = rawData?.AcsEvent || rawData?.AccessControllerEvent || rawData;

    if (!acsEvent) {
      return { received: false, count: 0 };
    }

    const device = (await this.deviceRepo.findByOrgAndCode(1, 'DEV-HQ-HIK01')) || (await this.deviceRepo.listByOrg(1))[0];
    if (!device) {
      return { received: false, count: 0 };
    }

    const rawVendorUserId = acsEvent.employeeNoString || acsEvent.cardNo || String(acsEvent.serialNo || '1');
    const mapping = await this.mappingRepo.findMapping(device.id, rawVendorUserId);
    const externalEmployeeId = mapping ? mapping.external_employee_id : `EMP-${rawVendorUserId.padStart(4, '0')}`;

    const now = new Date();
    const eventDate = now.toISOString().split('T')[0]!;
    const punchTimeUtc = acsEvent.time ? new Date(acsEvent.time).toISOString() : now.toISOString();

    let punchType: PunchType = PunchType.IN;
    if (acsEvent.minor === 76 || acsEvent.minor === 22) {
      punchType = PunchType.OUT;
    }

    let verificationType: VerificationType = VerificationType.FACE;
    const verifyModeStr = (acsEvent.currentVerifyMode || '').toLowerCase();
    if (verifyModeStr.includes('card') || acsEvent.cardNo) {
      verificationType = VerificationType.CARD;
    } else if (verifyModeStr.includes('fp') || verifyModeStr.includes('finger')) {
      verificationType = VerificationType.FINGERPRINT;
    }

    const fingerprint = generateEventFingerprint({
      organizationId: 'ORG-TECHIVE',
      employeeId: externalEmployeeId,
      deviceId: device.device_code,
      punchTimeUtc,
      punchType,
    });

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
        String(acsEvent.serialNo || randomUUID()),
        rawVendorUserId,
        acsEvent.time ? new Date(acsEvent.time) : now,
        JSON.stringify(rawData),
        fingerprint,
      ],
    );

    const rawLogId = rawLogRes.insertId || 1;

    const punchTime = acsEvent.time ? new Date(acsEvent.time) : now;
    const eventValue: Record<string, unknown> = {
      eventId: randomUUID(),
      schemaVersion: 1,
      organizationId: 'ORG-TECHIVE',
      branchId: device.branch_id ?? null,
      employeeId: externalEmployeeId,
      deviceId: device.device_code,
      vendor: device.vendor,
      punchTime: punchTimeUtc,
      punchTimeUtc,
      receivedAt: now.toISOString(),
      punchType,
      verificationType,
      source: 'PUSH',
      eventFingerprint: fingerprint,
      metadata: acsEvent,
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
          punchTime,
          punchTimeUtc: punchTime,
          receivedAt: now,
          punchType,
          verificationType,
          source: 'PUSH',
          vendorEventId: String(acsEvent.serialNo || ''),
          eventFingerprint: fingerprint,
        },
        conn,
      );
      if (r.inserted) {
        await this.enqueueWebhookOutbox(conn, device, fingerprint, eventValue);
      }
      return r;
    });

    if (result.inserted) {
      try {
        await this.kafkaProducer.publish({
          topic: KAFKA_TOPICS.ATTENDANCE_NORMALIZED,
          key: device.device_code,
          value: eventValue,
        });
      } catch {
        // Kafka fallback
      }
    }

    return { received: true, count: 1 };
  }

  public async purgeLogs(): Promise<{ success: boolean; message: string; checkpoint: number }> {
    await this.db.query('DELETE FROM attendance_logs');
    await this.db.query('DELETE FROM raw_punch_logs');

    // Get current total matches from device to set checkpoint
    let checkpoint = 0;
    try {
      const device = await this.deviceRepo.findByOrgAndCode(1, 'DEV-HQ-HIK01');
      if (device) {
        const client = new ISAPIClient({
          host: device.host || '192.168.100.186',
          port: device.port || 80,
          username: (device.auth_metadata as any)?.username || 'admin',
          password: (device.auth_metadata as any)?.password || 'uno@6488',
          useHttps: false,
          timeoutMs: 5000,
        });
        const countCheck = await client.searchAcsEvents({
          searchID: randomUUID(),
          searchResultPosition: 0,
          maxResults: 1,
          major: 0,
        });
        const totalMatches = countCheck.AcsEvent?.totalMatches || 0;
        const lastEventRes = await client.searchAcsEvents({
          searchID: randomUUID(),
          searchResultPosition: Math.max(0, totalMatches - 1),
          maxResults: 1,
          major: 0,
        });
        const lastSerial = lastEventRes.AcsEvent?.InfoList?.[0]?.serialNo || totalMatches;
        checkpoint = lastSerial;
        this.lastSyncedSerialMap.set(device.id, checkpoint);
      }
    } catch {
      // ignore
    }

    return {
      success: true,
      message: 'All logs purged. Checkpoint set to current terminal count so only new punches will be captured.',
      checkpoint,
    };
  }

  public async deletePunchLog(id: number): Promise<{ success: boolean; id: number }> {
    await this.db.query('DELETE FROM attendance_logs WHERE id = ?', [id]);
    return { success: true, id };
  }

  public async reemitToKafka(id: number): Promise<{ success: boolean; eventId: string }> {
    const rows = await this.db.query<any>('SELECT a.*, d.device_code FROM attendance_logs a JOIN devices d ON a.device_id = d.id WHERE a.id = ? OR a.raw_log_id = ?', [id, id]);
    if (!rows || rows.length === 0) {
      throw new NotFoundException(`Punch record #${id} not found`);
    }
    const rec = rows[0];
    const eventId = randomUUID();

    await this.kafkaProducer.publish({
      topic: KAFKA_TOPICS.ATTENDANCE_NORMALIZED,
      key: rec.device_code,
      value: {
        eventId,
        schemaVersion: 1,
        organizationId: 'ORG-TECHIVE',
        employeeId: rec.employee_id,
        deviceId: rec.device_code,
        vendor: rec.vendor,
        punchTime: new Date(rec.punch_time).toISOString(),
        punchTimeUtc: new Date(rec.punch_time_utc).toISOString(),
        receivedAt: new Date(rec.received_at).toISOString(),
        punchType: rec.punch_type,
        verificationType: rec.verification_type,
        source: rec.source || 'REPLAY',
        eventFingerprint: rec.event_fingerprint,
        metadata: { replayedAt: new Date().toISOString() },
      },
    });

    return { success: true, eventId };
  }
}
