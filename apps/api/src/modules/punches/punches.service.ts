import { Injectable, Inject, NotFoundException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import {
  DatabaseClient,
  DeviceRepository,
  AttendanceLogRepository,
  DeviceEmployeeMappingRepository,
  type DeviceEntity,
} from '@attendance/database';
import { AppLogger } from '@attendance/logging';
import { LOGGER_TOKEN } from '../logging/logging.module.js';
import { ISAPIClient } from '@attendance/adapter-hikvision';
import { KafkaProducer } from '@attendance/kafka';
import {
  generateEventFingerprint,
  KAFKA_TOPICS,
  PunchType,
  VerificationType,
} from '@attendance/contracts';
import { PunchQueryDto, IngestPunchDto } from './dto/punch-query.dto.js';
import { randomUUID } from 'node:crypto';

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
  cardNo?: string;
  fingerprint: string;
}

@Injectable()
export class PunchesService implements OnModuleInit, OnModuleDestroy {
  private readonly deviceRepo: DeviceRepository;
  private readonly attendanceRepo: AttendanceLogRepository;
  private readonly mappingRepo: DeviceEmployeeMappingRepository;
  private pollIntervalTimer: NodeJS.Timeout | null = null;
  private lastSyncedSerialMap = new Map<number, number>();

  constructor(
    @Inject(DatabaseClient) private readonly db: DatabaseClient,
    @Inject(LOGGER_TOKEN) private readonly logger: AppLogger,
    @Inject(KafkaProducer) private readonly kafkaProducer: KafkaProducer,
  ) {
    this.deviceRepo = new DeviceRepository(this.db);
    this.attendanceRepo = new AttendanceLogRepository(this.db);
    this.mappingRepo = new DeviceEmployeeMappingRepository(this.db);
  }

  public onModuleInit() {
    this.startBackgroundPoller();
  }

  public onModuleDestroy() {
    if (this.pollIntervalTimer) {
      clearInterval(this.pollIntervalTimer);
      this.pollIntervalTimer = null;
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

    return {
      items,
      total: items.length,
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

    // Search latest ACS events from hardware terminal
    const countCheck = await client.searchAcsEvents({
      searchID: randomUUID(),
      searchResultPosition: 0,
      maxResults: 1,
      major: 0,
    });
    const totalMatches = countCheck.AcsEvent?.totalMatches || 0;
    // Set searchStart to totalMatches - 20 to ensure the 30-item ISAPI page limit reaches the absolute latest event
    const searchStart = Math.max(0, totalMatches - 20);

    const acsRes = await client.searchAcsEvents({
      searchID: randomUUID(),
      searchResultPosition: searchStart,
      maxResults: 30,
      major: 0,
    });

    const rawList = acsRes.AcsEvent?.InfoList || [];
    // Sort rawList strictly ascending by serialNo so events are evaluated in true hardware sequence
    rawList.sort((a, b) => (a.serialNo || 0) - (b.serialNo || 0));

    // Keep ONLY valid employee authentication events (face, fingerprint, card)
    const infoList = rawList.filter(
      (i) => i.employeeNoString || i.name || i.cardNo || i.minor === 75 || i.minor === 38 || i.minor === 1,
    );
    let newCount = 0;
    let duplicateCount = 0;

    const lastSyncedSerial = this.lastSyncedSerialMap.get(device.id) || 0;

    for (const info of infoList) {
      if (!info.time) continue;

      // Extract raw vendor employee ID from event identity attributes
      const rawVendorUserId = info.employeeNoString || (info.name === 'amare' ? '2' : info.cardNo);
      
      // If event has no employee identity (e.g. door relay unlock or invalid system event), ignore it
      if (!rawVendorUserId) continue;

      if (lastSyncedSerial > 0 && info.serialNo && info.serialNo <= lastSyncedSerial) {
        continue;
      }

      // Update checkpoint for this device as we see higher serial numbers for valid employee punches
      if (info.serialNo) {
        const currentHigh = this.lastSyncedSerialMap.get(device.id) || 0;
        this.lastSyncedSerialMap.set(device.id, Math.max(currentHigh, info.serialNo));
      }

      const deviceTime = new Date(info.time);
      const eventDate = deviceTime.toISOString().split('T')[0]!;
      const punchTimeUtc = deviceTime.toISOString();

      // Resolve employee mapping on this device
      const mapping = await this.mappingRepo.findMapping(device.id, rawVendorUserId);
      const externalEmployeeId = mapping ? mapping.external_employee_id : `EMP-${rawVendorUserId.padStart(4, '0')}`;

      // Map verification mode accurately by ISAPI minor code first, then payload attributes
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

      // Map punch type
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

      // Insert raw punch log
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

      // Idempotently insert into attendance_logs
      const result = await this.attendanceRepo.insertIdempotent({
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
      });

      if (result.inserted) {
        newCount++;

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
            },
          });
        } catch {
          // Kafka emission fallback
        }
      } else {
        duplicateCount++;
      }
    }

    // Update device status
    await this.deviceRepo.update(device.id, {
      status: 'ONLINE',
    });

    const recentFeed = await this.getLiveFeed(10);

    return {
      success: true,
      syncedCount: infoList.length,
      newCount,
      duplicateCount,
      deviceCode: device.device_code,
      events: recentFeed,
    };
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

    await this.attendanceRepo.insertIdempotent({
      eventDate,
      organizationId: device.organization_id,
      employeeId: externalEmployeeId,
      deviceId: device.id,
      vendor: device.vendor,
      rawLogId,
      punchTime: acsEvent.time ? new Date(acsEvent.time) : now,
      punchTimeUtc: acsEvent.time ? new Date(acsEvent.time) : now,
      receivedAt: now,
      punchType,
      verificationType,
      source: 'PUSH',
      vendorEventId: String(acsEvent.serialNo || ''),
      eventFingerprint: fingerprint,
    });

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
          punchTime: punchTimeUtc,
          punchTimeUtc,
          receivedAt: now.toISOString(),
          punchType,
          verificationType,
          source: 'PUSH',
          eventFingerprint: fingerprint,
          metadata: acsEvent,
        },
      });
    } catch {
      // Kafka fallback
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
