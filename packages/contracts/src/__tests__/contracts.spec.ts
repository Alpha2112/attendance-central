import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  DeviceVendor,
  PunchType,
  VerificationType,
  DeviceStatus,
  EventSource,
  CommandType,
  CommandStatus,
  RawAttendanceEventSchema,
  AttendanceEventSchema,
  DeviceStatusEventSchema,
  DeviceCommandEventSchema,
  DeviceCommandResultEventSchema,
  SyncRequestedEventSchema,
  SyncCompletedEventSchema,
  SyncFailedEventSchema,
  IntegrationDeliveryEventSchema,
  DeadLetterEventSchema,
  WebhookEnvelopeSchema,
  normalizePunchType,
  normalizeVerificationType,
  generateEventFingerprint,
  generateRawEventFingerprint,
  buildKafkaDeviceKey,
  buildKafkaEmployeeKey,
  signWebhookPayload,
  verifyWebhookSignature,
  DomainError,
  NormalizationError,
  MappingNotFoundError,
} from '../index.js';

describe('Event Contracts & Normalization Primitives', () => {
  describe('Schema Validation & Serialization', () => {
    it('should validate and parse valid RawAttendanceEvent', () => {
      const event = {
        eventId: crypto.randomUUID(),
        schemaVersion: 1,
        tenantId: '1',
        organizationId: '10',
        deviceId: '100',
        vendor: DeviceVendor.ZKTECO,
        adapter: 'zkteco-standalone',
        vendorUserId: '457',
        deviceTime: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        source: EventSource.PUSH,
        rawPayload: { punch: '0', pin: '457' },
      };

      const result = RawAttendanceEventSchema.safeParse(event);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.vendor).toBe(DeviceVendor.ZKTECO);
        expect(result.data.schemaVersion).toBe(1);
      }
    });

    it('should reject RawAttendanceEvent with missing required fields or invalid uuid', () => {
      const invalid = {
        eventId: 'not-a-uuid',
        organizationId: '10',
      };
      const result = RawAttendanceEventSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should validate and parse valid AttendanceEvent', () => {
      const event = {
        eventId: crypto.randomUUID(),
        schemaVersion: 1,
        organizationId: '10',
        employeeId: 'EMP-000457',
        deviceId: '100',
        vendor: 'ZKTECO',
        punchTime: '2026-08-15T08:04:32.000Z',
        punchTimeUtc: '2026-08-15T05:04:32.000Z',
        receivedAt: '2026-08-15T05:04:33.000Z',
        punchType: PunchType.IN,
        verificationType: VerificationType.FINGERPRINT,
        eventFingerprint: 'f56a89c8942b083c0724813589b2512f451f2a36b3f7fbe60cb54e3d5a1b32d0',
      };

      const result = AttendanceEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('should validate DeviceStatus, Commands, Sync, Integration, and DLQ schemas', () => {
      const statusEvt = {
        eventId: crypto.randomUUID(),
        schemaVersion: 1,
        organizationId: '10',
        deviceId: '100',
        status: DeviceStatus.ONLINE,
        latencyMs: 45,
        observedAt: new Date().toISOString(),
      };
      expect(DeviceStatusEventSchema.safeParse(statusEvt).success).toBe(true);

      const cmdEvt = {
        commandId: crypto.randomUUID(),
        schemaVersion: 1,
        organizationId: '10',
        deviceId: '100',
        commandType: CommandType.SYNC_TIME,
        issuedBy: 'admin',
        issuedAt: new Date().toISOString(),
        timeoutSeconds: 30,
      };
      expect(DeviceCommandEventSchema.safeParse(cmdEvt).success).toBe(true);

      const cmdResultEvt = {
        commandId: crypto.randomUUID(),
        schemaVersion: 1,
        organizationId: '10',
        deviceId: '100',
        commandType: CommandType.SYNC_TIME,
        status: CommandStatus.EXECUTED,
        executedAt: new Date().toISOString(),
        latencyMs: 120,
      };
      expect(DeviceCommandResultEventSchema.safeParse(cmdResultEvt).success).toBe(true);

      const syncReq = {
        jobId: crypto.randomUUID(),
        schemaVersion: 1,
        organizationId: '10',
        deviceId: '100',
        jobType: 'HISTORICAL',
        requestedBy: 'operator',
        requestedAt: new Date().toISOString(),
      };
      expect(SyncRequestedEventSchema.safeParse(syncReq).success).toBe(true);

      const syncComp = {
        jobId: crypto.randomUUID(),
        schemaVersion: 1,
        organizationId: '10',
        deviceId: '100',
        jobType: 'HISTORICAL',
        recordsReceived: 100,
        recordsInserted: 95,
        duplicates: 5,
        errors: 0,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 450,
      };
      expect(SyncCompletedEventSchema.safeParse(syncComp).success).toBe(true);

      const syncFail = {
        jobId: crypto.randomUUID(),
        schemaVersion: 1,
        organizationId: '10',
        deviceId: '100',
        jobType: 'HISTORICAL',
        errorCode: 'TIMEOUT',
        errorMessage: 'Device unreachable',
        failedAt: new Date().toISOString(),
      };
      expect(SyncFailedEventSchema.safeParse(syncFail).success).toBe(true);

      const intDelivery = {
        deliveryId: crypto.randomUUID(),
        schemaVersion: 1,
        organizationId: '10',
        integrationId: '5',
        outboxEventId: 'evt_1',
        eventType: 'attendance.punch.created',
        targetUrl: 'https://hrms.enterprise.local/api/attendance',
        attemptNumber: 1,
        payload: { punch: 'IN' },
        deliveredAt: new Date().toISOString(),
        statusCode: 200,
        latencyMs: 150,
      };
      expect(IntegrationDeliveryEventSchema.safeParse(intDelivery).success).toBe(true);

      const dlqEvt = {
        deadLetterId: crypto.randomUUID(),
        originalTopic: 'attendance.raw.v1',
        originalPayload: { raw: 1 },
        errorReason: 'Unknown vendor format',
        consumerGroup: 'attendance-normalizer-group',
        timestamp: new Date().toISOString(),
        retryCount: 3,
      };
      expect(DeadLetterEventSchema.safeParse(dlqEvt).success).toBe(true);
    });
  });

  describe('Punch Type Normalization', () => {
    it('should correctly normalize ZKTeco punch state codes', () => {
      expect(normalizePunchType(DeviceVendor.ZKTECO, '0')).toBe(PunchType.IN);
      expect(normalizePunchType(DeviceVendor.ZKTECO, '1')).toBe(PunchType.OUT);
      expect(normalizePunchType(DeviceVendor.ZKTECO, '2')).toBe(PunchType.BREAK_OUT);
      expect(normalizePunchType(DeviceVendor.ZKTECO, '3')).toBe(PunchType.BREAK_IN);
      expect(normalizePunchType(DeviceVendor.ZKTECO, '4')).toBe(PunchType.OVERTIME_IN);
      expect(normalizePunchType(DeviceVendor.ZKTECO, '5')).toBe(PunchType.OVERTIME_OUT);
    });

    it('should correctly normalize Hikvision and Suprema punch strings', () => {
      expect(normalizePunchType(DeviceVendor.HIKVISION, 'checkIn')).toBe(PunchType.IN);
      expect(normalizePunchType(DeviceVendor.HIKVISION, 'checkOut')).toBe(PunchType.OUT);
      expect(normalizePunchType(DeviceVendor.SUPREMA, 'START_WORK')).toBe(PunchType.IN);
      expect(normalizePunchType(DeviceVendor.SUPREMA, 'LEAVE_WORK')).toBe(PunchType.OUT);
    });

    it('should safely map unknown codes to UNKNOWN without throwing', () => {
      expect(normalizePunchType(DeviceVendor.ZKTECO, '999')).toBe(PunchType.UNKNOWN);
      expect(normalizePunchType('CUSTOM_VENDOR', 'random_punch_code')).toBe(PunchType.UNKNOWN);
      expect(normalizePunchType(DeviceVendor.ZKTECO, null)).toBe(PunchType.UNKNOWN);
      expect(normalizePunchType(DeviceVendor.ZKTECO, undefined)).toBe(PunchType.UNKNOWN);
    });
  });

  describe('Verification Type Normalization', () => {
    it('should correctly normalize ZKTeco verification codes', () => {
      expect(normalizeVerificationType(DeviceVendor.ZKTECO, '1')).toBe(
        VerificationType.FINGERPRINT,
      );
      expect(normalizeVerificationType(DeviceVendor.ZKTECO, '15')).toBe(VerificationType.FACE);
      expect(normalizeVerificationType(DeviceVendor.ZKTECO, '4')).toBe(VerificationType.CARD);
      expect(normalizeVerificationType(DeviceVendor.ZKTECO, '8')).toBe(VerificationType.PALM);
      expect(normalizeVerificationType(DeviceVendor.ZKTECO, '2')).toBe(VerificationType.PIN);
    });

    it('should correctly normalize Hikvision and Suprema methods', () => {
      expect(normalizeVerificationType(DeviceVendor.HIKVISION, 'face')).toBe(VerificationType.FACE);
      expect(normalizeVerificationType(DeviceVendor.HIKVISION, 'fp')).toBe(
        VerificationType.FINGERPRINT,
      );
      expect(normalizeVerificationType(DeviceVendor.SUPREMA, 'BLE')).toBe(
        VerificationType.BLUETOOTH,
      );
    });

    it('should safely map unknown verification methods to UNKNOWN without throwing', () => {
      expect(normalizeVerificationType(DeviceVendor.ZKTECO, 'unsupported_method')).toBe(
        VerificationType.UNKNOWN,
      );
      expect(normalizeVerificationType(DeviceVendor.ZKTECO, null)).toBe(VerificationType.UNKNOWN);
    });
  });

  describe('Deterministic Event Fingerprinting', () => {
    it('should generate identical SHA-256 fingerprint for identical punch inputs', () => {
      const inputA = {
        organizationId: 10,
        employeeId: 'EMP-000457',
        deviceId: 101,
        punchTimeUtc: '2026-08-15T05:04:32.000Z',
        punchType: PunchType.IN,
      };

      const inputB = {
        organizationId: '10',
        employeeId: 'emp-000457', // Case-insensitive matching
        deviceId: '101',
        punchTimeUtc: new Date('2026-08-15T05:04:32.000Z'),
        punchType: 'IN',
      };

      const fpA = generateEventFingerprint(inputA);
      const fpB = generateEventFingerprint(inputB);

      expect(fpA).toBe(fpB);
      expect(fpA.length).toBe(64); // Valid SHA-256 hex string
    });

    it('should generate different fingerprint when punch time or punch type changes', () => {
      const base = {
        organizationId: 10,
        employeeId: 'EMP-000457',
        deviceId: 101,
        punchTimeUtc: '2026-08-15T05:04:32.000Z',
        punchType: PunchType.IN,
      };

      const differentTime = { ...base, punchTimeUtc: '2026-08-15T05:04:33.000Z' };
      const differentType = { ...base, punchType: PunchType.OUT };

      expect(generateEventFingerprint(base)).not.toBe(generateEventFingerprint(differentTime));
      expect(generateEventFingerprint(base)).not.toBe(generateEventFingerprint(differentType));
    });

    it('should generate deterministic raw punch fingerprint', () => {
      const rawA = generateRawEventFingerprint({
        organizationId: 10,
        deviceId: 101,
        vendorUserId: '457',
        deviceTime: '2026-08-15T08:04:32.000Z',
        vendorPunchType: '0',
      });

      const rawB = generateRawEventFingerprint({
        organizationId: '10',
        deviceId: '101',
        vendorUserId: '457',
        deviceTime: new Date('2026-08-15T08:04:32.000Z'),
        vendorPunchType: '0',
      });

      expect(rawA).toBe(rawB);
    });
  });

  describe('Kafka Partition Key Helpers', () => {
    it('should build deterministic partition keys preserving per-device ordering', () => {
      expect(buildKafkaDeviceKey(10, 101)).toBe('10:101');
      expect(buildKafkaDeviceKey(10, 101, 'tenant_1')).toBe('tenant_1:10:101');
      expect(buildKafkaEmployeeKey(10, 'EMP-000457')).toBe('10:EMP-000457');
    });
  });

  describe('Webhook Signing & Signature Verification', () => {
    it('should sign and verify webhook payloads using HMAC SHA-256', () => {
      const secret = 'webhook_secret_key_12345';
      const envelope = {
        eventId: crypto.randomUUID(),
        eventType: 'attendance.punch.created',
        timestamp: new Date().toISOString(),
        organizationId: '10',
        attemptNumber: 1,
        data: { employeeId: 'EMP-000457', punchType: 'IN' },
      };

      const payloadStr = JSON.stringify(envelope);
      const signature = signWebhookPayload(payloadStr, secret);

      expect(signature.startsWith('sha256=')).toBe(true);
      expect(verifyWebhookSignature(signature, payloadStr, secret)).toBe(true);
      expect(verifyWebhookSignature('sha256=invalid_hash', payloadStr, secret)).toBe(false);
      expect(verifyWebhookSignature(signature, payloadStr, 'wrong_secret')).toBe(false);
    });

    it('should validate WebhookEnvelope schema', () => {
      const envelope = {
        eventId: crypto.randomUUID(),
        eventType: 'attendance.punch.created',
        timestamp: new Date().toISOString(),
        organizationId: '10',
        attemptNumber: 1,
        data: { test: true },
      };
      expect(WebhookEnvelopeSchema.safeParse(envelope).success).toBe(true);
    });
  });

  describe('Typed Domain Errors', () => {
    it('should create domain errors with appropriate metadata and codes', () => {
      const err = new MappingNotFoundError(101, '457');
      expect(err).toBeInstanceOf(DomainError);
      expect(err.code).toBe('MAPPING_NOT_FOUND');
      expect(err.isOperational).toBe(true);
      expect(err.details).toEqual({ deviceId: 101, vendorUserId: '457' });

      const normErr = new NormalizationError('Invalid payload structure');
      expect(normErr.code).toBe('NORMALIZATION_ERROR');
    });
  });
});
