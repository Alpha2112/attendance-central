import {
  type RawAttendanceEvent,
  type AttendanceEvent,
  RawAttendanceEventSchema,
  KAFKA_TOPICS,
  generateEventFingerprint,
  normalizePunchType,
  normalizeVerificationType,
  buildKafkaDeviceKey,
  PunchType,
  VerificationType,
} from '@attendance/contracts';
import { type DatabaseClient, runInTransaction } from '@attendance/database';
import { type KafkaProducer } from '@attendance/kafka';
import { type AppLogger } from '@attendance/logging';
import { randomUUID } from 'node:crypto';

export interface NormalizerOptions {
  batchSize?: number;
  commitIntervalMs?: number;
}

export class NormalizerService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly kafkaProducer: KafkaProducer,
    private readonly logger: AppLogger,
    public readonly options: NormalizerOptions = {},
  ) {}

  /**
   * Processes and normalizes a single raw attendance event.
   */
  public async processEvent(rawEvent: RawAttendanceEvent): Promise<AttendanceEvent | null> {
    const parseResult = RawAttendanceEventSchema.safeParse(rawEvent);
    if (!parseResult.success) {
      this.logger.warn(
        { errors: parseResult.error.errors, eventId: rawEvent.eventId },
        'Raw attendance event failed schema validation. Emitting to DLQ.',
      );
      await this.publishToDLQ(rawEvent, 'SCHEMA_VALIDATION_FAILED', parseResult.error.message);
      return null;
    }

    const event = parseResult.data;
    const deviceDate = new Date(event.deviceTime);
    const eventDateStr = deviceDate.toISOString().split('T')[0]!; // YYYY-MM-DD for partitioning

    // 1. Resolve employee mapping
    const employeeId = await this.resolveEmployeeId(
      event.organizationId,
      event.deviceId,
      event.vendorUserId,
    );

    // 2. Resolve database entity numeric IDs
    const orgNumericId = await this.resolveOrganizationNumericId(event.organizationId);
    const deviceNumericId = await this.resolveDeviceNumericId(event.deviceId);
    const branchNumericId = await this.resolveBranchNumericId(event.branchId);

    // 3. Normalize punch type and verification type
    const normalizedPunch = normalizePunchType(event.vendor, event.vendorPunchType) as PunchType;
    const normalizedVerification = normalizeVerificationType(
      event.vendor,
      event.vendorVerificationType,
    ) as VerificationType;

    // Compute deterministic SHA-256 fingerprint
    const fingerprint = generateEventFingerprint({
      organizationId: event.organizationId,
      employeeId,
      deviceId: event.deviceId,
      punchTimeUtc: deviceDate.toISOString(),
      punchType: normalizedPunch,
    });

    const normalizedEventId = randomUUID();
    const normalizedEvent: AttendanceEvent = {
      eventId: normalizedEventId,
      schemaVersion: 1,
      tenantId: event.tenantId,
      organizationId: event.organizationId,
      branchId: event.branchId,
      employeeId,
      deviceId: event.deviceId,
      deviceSerialNumber: event.deviceSerialNumber,
      vendor: event.vendor,
      punchTime: deviceDate.toISOString(),
      punchTimeUtc: deviceDate.toISOString(),
      receivedAt: new Date(event.receivedAt).toISOString(),
      punchType: normalizedPunch,
      verificationType: normalizedVerification,
      source: event.source,
      vendorEventId: event.vendorEventId,
      eventFingerprint: fingerprint,
      metadata: {
        vendorPunchType: event.vendorPunchType,
        vendorVerificationType: event.vendorVerificationType,
        rawEventId: event.eventId,
      },
    };

    // 4. Execute atomic MySQL transaction (attendance_logs + outbox_events)
    try {
      await runInTransaction(this.db, async (conn) => {
        // A. Insert into attendance_logs
        await conn.query(
          `INSERT INTO attendance_logs (
            event_date, tenant_id, organization_id, branch_id, employee_id,
            device_id, vendor, raw_log_id, punch_time, punch_time_utc,
            received_at, punch_type, verification_type, source,
            vendor_event_id, event_fingerprint
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            eventDateStr,
            event.tenantId ? parseInt(event.tenantId, 10) || null : null,
            orgNumericId,
            branchNumericId,
            employeeId,
            deviceNumericId,
            event.vendor,
            0, // raw_log_id reference
            deviceDate,
            deviceDate,
            new Date(event.receivedAt),
            normalizedPunch,
            normalizedVerification,
            event.source,
            event.vendorEventId ?? null,
            fingerprint,
          ],
        );

        // B. Insert into transactional outbox
        await conn.query(
          `INSERT INTO outbox_events (
            event_id, event_type, aggregate_type, aggregate_id, payload, status, available_at
          ) VALUES (?, ?, ?, ?, ?, 'PENDING', NOW(6))`,
          [
            normalizedEventId,
            'attendance.normalized',
            'ATTENDANCE',
            employeeId,
            JSON.stringify(normalizedEvent),
          ],
        );
      });

      this.logger.info(
        {
          eventId: normalizedEventId,
          employeeId,
          fingerprint,
          punchType: normalizedPunch,
          verificationType: normalizedVerification,
        },
        'Attendance event normalized and committed to outbox',
      );

      // 5. Publish to Kafka topic attendance.normalized.v1
      const partitionKey = buildKafkaDeviceKey(
        event.organizationId,
        event.deviceId,
        event.tenantId,
      );

      await this.kafkaProducer.publish({
        topic: KAFKA_TOPICS.ATTENDANCE_NORMALIZED,
        key: partitionKey,
        value: normalizedEvent,
      });

      return normalizedEvent;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);

      // Duplicate detection via DB unique constraint
      if (
        msg.includes('ER_DUP_ENTRY') ||
        msg.includes('uq_attendance_fingerprint') ||
        msg.includes('Duplicate entry')
      ) {
        this.logger.info(
          { fingerprint, eventId: event.eventId },
          'Duplicate attendance event ignored idempotently',
        );
        return null;
      }

      this.logger.error(
        { error: msg, eventId: event.eventId, fingerprint },
        'Failed to persist normalized attendance event',
      );
      await this.publishToDLQ(rawEvent, 'PERSISTENCE_FAILED', msg);
      throw err;
    }
  }

  /**
   * Resolves external employee identifier from device mapping table.
   */
  private async resolveEmployeeId(
    _organizationId: string,
    _deviceId: string,
    vendorUserId: string,
  ): Promise<string> {
    try {
      const rows = (await this.db.query(
        `SELECT external_employee_id FROM device_employee_mappings 
         WHERE vendor_user_id = ? AND status = 'ACTIVE' LIMIT 1`,
        [vendorUserId],
      )) as Array<{ external_employee_id?: string }>;

      if (Array.isArray(rows) && rows.length > 0 && rows[0]?.external_employee_id) {
        return rows[0].external_employee_id;
      }
    } catch {
      // Table query fallback
    }

    // Safe fallback: Retain vendor user ID so NO data is lost
    return vendorUserId;
  }

  private async resolveOrganizationNumericId(orgCodeOrId: string): Promise<number> {
    const parsed = parseInt(orgCodeOrId, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
    try {
      const rows = (await this.db.query('SELECT id FROM organizations WHERE code = ? LIMIT 1', [
        orgCodeOrId,
      ])) as Array<{ id?: number }>;
      if (Array.isArray(rows) && rows.length > 0 && rows[0]?.id) return rows[0].id;
    } catch {}
    return 1;
  }

  private async resolveDeviceNumericId(deviceCodeOrId: string): Promise<number> {
    const parsed = parseInt(deviceCodeOrId, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
    try {
      const rows = (await this.db.query('SELECT id FROM devices WHERE device_code = ? LIMIT 1', [
        deviceCodeOrId,
      ])) as Array<{ id?: number }>;
      if (Array.isArray(rows) && rows.length > 0 && rows[0]?.id) return rows[0].id;
    } catch {}
    return 1;
  }

  private async resolveBranchNumericId(branchCodeOrId?: string): Promise<number | null> {
    if (!branchCodeOrId) return null;
    const parsed = parseInt(branchCodeOrId, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
    try {
      const rows = (await this.db.query('SELECT id FROM branches WHERE code = ? LIMIT 1', [
        branchCodeOrId,
      ])) as Array<{ id?: number }>;
      if (Array.isArray(rows) && rows.length > 0 && rows[0]?.id) return rows[0].id;
    } catch {}
    return null;
  }

  private async publishToDLQ(
    rawEvent: unknown,
    reason: string,
    errorMessage: string,
  ): Promise<void> {
    try {
      await this.kafkaProducer.publish({
        topic: KAFKA_TOPICS.DEAD_LETTER_QUEUE,
        key: 'dlq:normalizer',
        value: {
          dlqId: randomUUID(),
          failedAt: new Date().toISOString(),
          sourceTopic: KAFKA_TOPICS.ATTENDANCE_RAW,
          reason,
          errorMessage,
          payload: rawEvent,
        },
      });
    } catch (err: unknown) {
      this.logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        'Failed to emit event to DLQ',
      );
    }
  }
}
