import { describe, it, expect, vi } from 'vitest';
import { NormalizerService, WebhookDispatcher, OutboxDispatcher, ReplayService } from '../index.js';
import {
  type RawAttendanceEvent,
  DeviceVendor,
  EventSource,
  PunchType,
  VerificationType,
} from '@attendance/contracts';
import { createLogger } from '@attendance/logging';
import { type DatabaseClient } from '@attendance/database';
import { type KafkaProducer } from '@attendance/kafka';

vi.mock('@attendance/database', async () => {
  return {
    runInTransaction: vi
      .fn()
      .mockImplementation(async (_db: unknown, cb: (conn: unknown) => Promise<unknown>) => {
        return await cb({
          query: vi.fn().mockResolvedValue([{ insertId: 1 }]),
        });
      }),
  };
});

describe('Outbound Integration & Normalizer Suite', () => {
  const logger = createLogger({ serviceName: 'integration-test', level: 'silent' });

  describe('1. Normalizer Engine & Outbox Creation', () => {
    it('should normalize raw biometric punch and insert into outbox atomically', async () => {
      const mockDb = {
        query: vi.fn().mockResolvedValue([]),
      } as unknown as DatabaseClient;

      const mockKafkaProducer = {
        publish: vi.fn().mockResolvedValue([]),
      } as unknown as KafkaProducer;

      const normalizer = new NormalizerService(mockDb, mockKafkaProducer, logger);

      const rawEvent: RawAttendanceEvent = {
        eventId: 'a0000000-0000-4000-8000-000000001001',
        schemaVersion: 1,
        organizationId: 'ORG-TECHIVE',
        branchId: 'BR-HQ-01',
        deviceId: 'DEV-HQ-ZK01',
        deviceSerialNumber: 'ZK-MB2000-112233',
        vendor: DeviceVendor.ZKTECO,
        adapter: 'zkteco-standalone',
        vendorUserId: '1001',
        deviceTime: '2026-08-17T11:00:00.000Z',
        receivedAt: '2026-08-17T11:00:01.000Z',
        source: EventSource.PULL,
        vendorPunchType: '0',
        vendorVerificationType: '1',
        rawPayload: { punch: 'simulated' },
      };

      const normalized = await normalizer.processEvent(rawEvent);

      expect(normalized).toBeDefined();
      expect(normalized?.organizationId).toBe('ORG-TECHIVE');
      expect(normalized?.employeeId).toBe('1001');
      expect(normalized?.punchType).toBe(PunchType.IN);
      expect(normalized?.verificationType).toBe(VerificationType.FINGERPRINT);
      expect(normalized?.eventFingerprint).toBeDefined();
      expect(mockKafkaProducer.publish).toHaveBeenCalledTimes(1);
    });

    it('should route invalid payload to DLQ on schema failure', async () => {
      const mockDb = { query: vi.fn() } as unknown as DatabaseClient;
      const mockKafkaProducer = {
        publish: vi.fn().mockResolvedValue([]),
      } as unknown as KafkaProducer;

      const normalizer = new NormalizerService(mockDb, mockKafkaProducer, logger);

      const invalidEvent = {
        eventId: 'invalid-event',
        // missing required fields
      } as unknown as RawAttendanceEvent;

      const result = await normalizer.processEvent(invalidEvent);

      expect(result).toBeNull();
      expect(mockKafkaProducer.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'attendance.dlq.v1',
        }),
      );
    });
  });

  describe('2. Webhook Dispatcher & HMAC SHA-256 Signer', () => {
    const dispatcher = new WebhookDispatcher(undefined, logger);

    it('should compute valid HMAC SHA-256 signature', () => {
      const payload = JSON.stringify({ eventId: 'evt-123', employeeId: 'EMP-99' });
      const timestamp = '1723800000000';
      const secret = 'super-secret-key-123';

      const signature = dispatcher.computeHmacSignature(payload, timestamp, secret);

      expect(signature).toBeDefined();
      expect(signature.startsWith('sha256=')).toBe(true);
      expect(signature.length).toBe(71); // 'sha256=' (7) + 64 hex chars
    });
  });

  describe('3. Transactional Outbox Batch Processing', () => {
    it('should fetch pending outbox events and process successful delivery', async () => {
      const mockDb = {
        query: vi
          .fn()
          .mockResolvedValueOnce([
            {
              id: 101,
              event_id: 'evt-norm-101',
              event_type: 'attendance.normalized',
              aggregate_type: 'ATTENDANCE',
              aggregate_id: 'EMP-1',
              payload: JSON.stringify({ employeeId: 'EMP-1', punchType: 'IN' }),
              status: 'PENDING',
              attempt_count: 0,
            },
          ])
          .mockResolvedValueOnce([]) // No subscribers -> mark published
          .mockResolvedValueOnce([{ affectedRows: 1 }]), // Update query
      } as unknown as DatabaseClient;

      const dispatcher = new OutboxDispatcher(mockDb, undefined, logger);
      const result = await dispatcher.processBatch(10);

      expect(result.processed).toBe(1);
      expect(result.succeeded).toBe(1);
    });

    it('should maintain PENDING state and schedule retry when HRMS endpoint fails (HTTP 500)', async () => {
      const mockDb = {
        query: vi
          .fn()
          .mockResolvedValueOnce([
            {
              id: 102,
              event_id: 'evt-norm-102',
              event_type: 'attendance.normalized',
              aggregate_type: 'ATTENDANCE',
              aggregate_id: 'EMP-2',
              payload: JSON.stringify({ employeeId: 'EMP-2', punchType: 'OUT' }),
              status: 'PENDING',
              attempt_count: 0,
            },
          ])
          .mockResolvedValueOnce([
            {
              id: 1,
              organization_id: 'ORG-TECHIVE',
              name: 'Failing HRMS',
              target_type: 'HRMS_WEBHOOK',
              endpoint_url: 'http://127.0.0.1:9999/failing-endpoint',
              auth_type: 'HMAC_SHA256',
              retry_limit: 3,
              timeout_ms: 100,
            },
          ])
          .mockResolvedValue([{ affectedRows: 1 }]),
      } as unknown as DatabaseClient;

      const dispatcher = new OutboxDispatcher(mockDb, undefined, logger);
      const result = await dispatcher.processBatch(10);

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(1);
      // Verify outbox update scheduled next retry without marking as FAILED
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE outbox_events SET available_at ='),
        expect.anything(),
      );
    });
  });

  describe('4. Replay Service & Audit Trail', () => {
    it('should reset outbox event to PENDING and write audit log', async () => {
      const mockDb = {
        query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
      } as unknown as DatabaseClient;

      const replay = new ReplayService(mockDb, undefined, logger);
      const success = await replay.replayEvent('evt-norm-101', 'OPERATOR-1');

      expect(success).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE outbox_events'), [
        'evt-norm-101',
      ]);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_logs'),
        expect.arrayContaining(['ORG-TECHIVE', 'OPERATOR-1', 'evt-norm-101']),
      );
    });
  });
});
