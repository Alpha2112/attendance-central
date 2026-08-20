import { describe, it, expect, vi } from 'vitest';
import {
  BioStarSessionManager,
  mapBioStarEventTypeToVerifyType,
  mapBioStarTnaKeyToPunchType,
  mapBioStarEventToRawAttendance,
  classifySupremaError,
  SupremaErrorCategory,
  SupremaDeviceAdapter,
  BioStarEventTypeId,
  BioStarTnaKey,
  type BioStarEventLog,
} from '../index.js';
import {
  type DeviceModel,
  DeviceStatus,
  DeviceVendor,
  DeviceCapability,
  PunchType,
} from '@attendance/contracts';

describe('Suprema BioStar 2 Adapter & Connector Suite', () => {
  const sampleDevice: DeviceModel = {
    id: 'DEV-HQ-SUP01',
    organizationId: 'ORG-TECHIVE',
    branchId: 'BR-HQ-01',
    deviceCode: 'DEV-HQ-SUP01',
    serialNumber: 'SUP-BS3-123456',
    name: 'Suprema BioStation 3',
    vendor: 'SUPREMA',
    protocol: 'BIOSTAR2_API',
    connectionMode: 'HYBRID',
    status: DeviceStatus.ONLINE,
    host: 'mock-biostar',
    port: 80,
    timezone: 'UTC',
    metadata: {
      username: 'admin',
      password: 'AdminPassword123',
    },
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  };

  describe('1. BioStar Session Lifecycle & Mutex Locking', () => {
    it('should acquire and cache session ID', async () => {
      const loginFn = vi.fn().mockResolvedValue('test-session-123');
      const manager = new BioStarSessionManager({ host: '127.0.0.1', username: 'admin' }, loginFn);

      const sessionId1 = await manager.getSessionId();
      expect(sessionId1).toBe('test-session-123');
      expect(loginFn).toHaveBeenCalledTimes(1);

      // Second call should use cached session
      const sessionId2 = await manager.getSessionId();
      expect(sessionId2).toBe('test-session-123');
      expect(loginFn).toHaveBeenCalledTimes(1);
    });

    it('should renew session when forceRenew is requested', async () => {
      let counter = 1;
      const loginFn = vi.fn().mockImplementation(async () => `session-${counter++}`);
      const manager = new BioStarSessionManager({ host: '127.0.0.1', username: 'admin' }, loginFn);

      const first = await manager.getSessionId();
      expect(first).toBe('session-1');

      const renewed = await manager.getSessionId(true);
      expect(renewed).toBe('session-2');
      expect(loginFn).toHaveBeenCalledTimes(2);
    });

    it('should prevent concurrent duplicate login calls via mutex locking', async () => {
      const loginFn = vi
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve('mutex-session'), 20)),
        );
      const manager = new BioStarSessionManager({ host: '127.0.0.1', username: 'admin' }, loginFn);

      const [s1, s2, s3] = await Promise.all([
        manager.getSessionId(),
        manager.getSessionId(),
        manager.getSessionId(),
      ]);

      expect(s1).toBe('mutex-session');
      expect(s2).toBe('mutex-session');
      expect(s3).toBe('mutex-session');
      expect(loginFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. BioStar Event Mapper & Verification Codes', () => {
    it('should map facial verification opcodes to platform Face type', () => {
      expect(mapBioStarEventTypeToVerifyType(BioStarEventTypeId.VERIFY_SUCCESS_FACE)).toBe('15');
      expect(mapBioStarEventTypeToVerifyType(BioStarEventTypeId.ACCESS_GRANTED_FACE)).toBe('15');
    });

    it('should map fingerprint and card opcodes', () => {
      expect(mapBioStarEventTypeToVerifyType(BioStarEventTypeId.VERIFY_SUCCESS_FINGERPRINT)).toBe(
        '1',
      );
      expect(mapBioStarEventTypeToVerifyType(BioStarEventTypeId.VERIFY_SUCCESS_CARD)).toBe('4');
      expect(mapBioStarEventTypeToVerifyType(BioStarEventTypeId.VERIFY_SUCCESS_QR)).toBe('30');
      expect(mapBioStarEventTypeToVerifyType(BioStarEventTypeId.VERIFY_SUCCESS_MOBILE_BLE)).toBe(
        '40',
      );
    });

    it('should map T&A keys to canonical platform punch types', () => {
      expect(mapBioStarTnaKeyToPunchType(BioStarTnaKey.CHECK_IN)).toBe(PunchType.IN);
      expect(mapBioStarTnaKeyToPunchType(BioStarTnaKey.CHECK_OUT)).toBe(PunchType.OUT);
      expect(mapBioStarTnaKeyToPunchType(BioStarTnaKey.BREAK_OUT)).toBe(PunchType.BREAK_OUT);
      expect(mapBioStarTnaKeyToPunchType(BioStarTnaKey.BREAK_IN)).toBe(PunchType.BREAK_IN);
      expect(mapBioStarTnaKeyToPunchType(undefined)).toBe('AUTO');
    });

    it('should convert BioStar event log to RawAttendanceEvent', () => {
      const log: BioStarEventLog = {
        id: 998811,
        datetime: '2026-08-16T09:15:00.000Z',
        event_type_id: {
          code: BioStarEventTypeId.VERIFY_SUCCESS_FACE,
          name: 'Face Verify Success',
        },
        device_id: {
          id: 501,
          name: 'BioStation 3',
        },
        user_id: {
          user_id: 'EMP-7788',
          name: 'Alex Vance',
        },
        user_name: 'Alex Vance',
        tna_key: BioStarTnaKey.CHECK_IN,
        temperature: 36.5,
        mask_status: 'NORMAL',
        has_image: true,
      };

      const rawEvent = mapBioStarEventToRawAttendance(sampleDevice, log);

      expect(rawEvent.vendor).toBe(DeviceVendor.SUPREMA);
      expect(rawEvent.adapter).toBe('suprema-biostar2');
      expect(rawEvent.vendorUserId).toBe('EMP-7788');
      expect(rawEvent.vendorPunchType).toBe(PunchType.IN);
      expect(rawEvent.vendorVerificationType).toBe('15');
      expect(rawEvent.deviceTime).toBe('2026-08-16T09:15:00.000Z');
      expect((rawEvent.rawPayload as Record<string, unknown>)['has_image']).toBe(true);
    });
  });

  describe('3. Error Classification', () => {
    it('should classify HTTP 401 as PERMANENT and non-retryable', () => {
      const classified = classifySupremaError(new Error('Session Expired'), 401);
      expect(classified.category).toBe(SupremaErrorCategory.PERMANENT);
      expect(classified.isRetryable).toBe(false);
    });

    it('should classify connection reset as TRANSIENT and retryable', () => {
      const classified = classifySupremaError(new Error('read ECONNRESET'));
      expect(classified.category).toBe(SupremaErrorCategory.TRANSIENT);
      expect(classified.isRetryable).toBe(true);
    });
  });

  describe('4. SupremaDeviceAdapter Contract Compliance', () => {
    const adapter = new SupremaDeviceAdapter();

    it('should declare full biometric capabilities', () => {
      expect(adapter.vendor).toBe(DeviceVendor.SUPREMA);
      expect(adapter.capabilities).toContain(DeviceCapability.PULL_LOGS);
      expect(adapter.capabilities).toContain(DeviceCapability.PUSH_LOGS);
      expect(adapter.capabilities).toContain(DeviceCapability.REALTIME_EVENTS);
      expect(adapter.capabilities).toContain(DeviceCapability.FACE);
      expect(adapter.capabilities).toContain(DeviceCapability.FINGERPRINT);
      expect(adapter.capabilities).toContain(DeviceCapability.CARD);
      expect(adapter.capabilities).toContain(DeviceCapability.PIN);
    });

    it('should test connection with simulation fallback', async () => {
      const result = await adapter.testConnection(sampleDevice);
      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeDefined();
    });

    it('should fetch incremental logs and advance cursor', async () => {
      const result = await adapter.fetchLogs(sampleDevice, {
        lastLogTimestamp: '2026-08-16T00:00:00.000Z',
        lastLogIndex: 0,
      });

      expect(result.events.length).toBe(5);
      expect(result.nextCursor).toBeDefined();
      expect(result.nextCursor?.lastLogIndex).toBe(5);
    });

    it('should query RTC clock', async () => {
      const clock = await adapter.getClock(sampleDevice);
      expect(clock.synchronized).toBe(true);
    });

    it('should implement RealtimeAttendanceAdapter subscribe and unsubscribe', async () => {
      const unsubscribe = await adapter.subscribe(sampleDevice, async () => {});
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });
  });
});
