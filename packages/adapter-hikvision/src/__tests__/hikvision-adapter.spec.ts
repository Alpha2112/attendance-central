import { describe, it, expect } from 'vitest';
import {
  parseDigestChallenge,
  generateDigestHeader,
  generateBasicHeader,
  mapHikvisionMinorToVerifyType,
  mapHikvisionEventToRawAttendance,
  classifyHikvisionError,
  HikvisionErrorCategory,
  HikvisionAlertStreamParser,
  HikvisionDeviceAdapter,
  HikvisionMinorEvent,
  type HikvisionAcsEventRecord,
} from '../index.js';
import {
  type DeviceModel,
  DeviceStatus,
  DeviceVendor,
  DeviceCapability,
} from '@attendance/contracts';

describe('Hikvision ISAPI Connector & Adapter Suite', () => {
  const sampleDevice: DeviceModel = {
    id: 'DEV-HQ-HIK01',
    organizationId: 'ORG-TECHIVE',
    branchId: 'BR-HQ-01',
    deviceCode: 'DEV-HQ-HIK01',
    serialNumber: 'HIK-SN-99881122',
    name: 'Hikvision Main Gate',
    vendor: 'HIKVISION',
    protocol: 'ISAPI',
    connectionMode: 'HYBRID',
    status: DeviceStatus.ONLINE,
    host: 'mock-hikvision',
    port: 80,
    timezone: 'UTC',
    metadata: {
      username: 'admin',
      password: 'AdminPassword123',
    },
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  };

  describe('1. RFC 7616 Digest Authentication & Header Generator', () => {
    it('should parse standard Hikvision WWW-Authenticate challenge header', () => {
      const challengeHeader =
        'Digest realm="Hikvision", nonce="4d5367334e4449334f545936", qop="auth", stale="false", algorithm="MD5"';
      const parsed = parseDigestChallenge(challengeHeader);

      expect(parsed).not.toBeNull();
      expect(parsed?.realm).toBe('Hikvision');
      expect(parsed?.nonce).toBe('4d5367334e4449334f545936');
      expect(parsed?.qop).toBe('auth');
      expect(parsed?.algorithm).toBe('MD5');
    });

    it('should compute valid Digest Authorization header with MD5 response', () => {
      const challenge = {
        realm: 'Hikvision',
        nonce: '4d5367334e4449334f545936',
        qop: 'auth',
        algorithm: 'MD5',
      };

      const header = generateDigestHeader(challenge, {
        username: 'admin',
        password: 'AdminPassword123',
        method: 'GET',
        uri: '/ISAPI/System/deviceInfo',
        nc: 1,
        cnonce: '0a4f113b',
      });

      expect(header.startsWith('Digest ')).toBe(true);
      expect(header).toContain('username="admin"');
      expect(header).toContain('realm="Hikvision"');
      expect(header).toContain('nonce="4d5367334e4449334f545936"');
      expect(header).toContain('uri="/ISAPI/System/deviceInfo"');
      expect(header).toContain('response=');
      expect(header).toContain('qop=auth');
    });

    it('should build standard Basic Authentication header', () => {
      const basic = generateBasicHeader('admin', '12345');
      expect(basic).toBe('Basic YWRtaW46MTIzNDU=');
    });
  });

  describe('2. ISAPI Event Mapper & Verification Codes', () => {
    it('should map facial verification event (Minor 75) to platform Face mode', () => {
      expect(mapHikvisionMinorToVerifyType(HikvisionMinorEvent.MINOR_FACE_VERIFY_PASS)).toBe('15');
    });

    it('should map card pass event (Minor 1) to platform Card mode', () => {
      expect(mapHikvisionMinorToVerifyType(HikvisionMinorEvent.MINOR_LEGAL_CARD_PASS)).toBe('4');
    });

    it('should map fingerprint event (Minor 38) to platform Fingerprint mode', () => {
      expect(mapHikvisionMinorToVerifyType(HikvisionMinorEvent.MINOR_FINGERPRINT_PASS)).toBe('1');
    });

    it('should map QR code event (Minor 80) to platform QR mode', () => {
      expect(mapHikvisionMinorToVerifyType(HikvisionMinorEvent.MINOR_QR_CODE_PASS)).toBe('30');
    });

    it('should convert Hikvision AcsEvent record to RawAttendanceEvent', () => {
      const record: HikvisionAcsEventRecord = {
        major: 5,
        minor: 75,
        time: '2026-08-16T08:30:00+00:00',
        employeeNoString: 'EMP-9988',
        name: 'Sarah Connor',
        cardNo: 'CARD-123456',
        doorNo: 1,
        currentVerifyMode: 'face',
        serialNo: 1045,
        mask: 'no',
        temperature: 36.6,
      };

      const rawEvent = mapHikvisionEventToRawAttendance(sampleDevice, record);

      expect(rawEvent.vendor).toBe(DeviceVendor.HIKVISION);
      expect(rawEvent.adapter).toBe('hikvision-isapi');
      expect(rawEvent.vendorUserId).toBe('EMP-9988');
      expect(rawEvent.vendorVerificationType).toBe('15');
      expect(rawEvent.deviceTime).toBe('2026-08-16T08:30:00.000Z');
      expect((rawEvent.rawPayload as Record<string, unknown>)['temperature']).toBe(36.6);
    });
  });

  describe('3. Error Classification', () => {
    it('should classify HTTP 401 Unauthorized as PERMANENT and non-retryable', () => {
      const classified = classifyHikvisionError(new Error('Unauthorized'), 401);
      expect(classified.category).toBe(HikvisionErrorCategory.PERMANENT);
      expect(classified.isRetryable).toBe(false);
    });

    it('should classify connection timeout as TRANSIENT and retryable', () => {
      const classified = classifyHikvisionError(
        new Error('ISAPI HTTP request timeout after 5000ms'),
      );
      expect(classified.category).toBe(HikvisionErrorCategory.TRANSIENT);
      expect(classified.isRetryable).toBe(true);
    });
  });

  describe('4. Alert Stream Parser', () => {
    it('should parse push payload into RawAttendanceEvent', () => {
      const parser = new HikvisionAlertStreamParser();
      const payload = {
        AcsEvent: {
          major: 5,
          minor: 75,
          time: '2026-08-16T17:00:00+00:00',
          employeeNoString: 'EMP-5544',
          serialNo: 200,
        },
      };

      const events = parser.parsePushPayload(sampleDevice, payload);
      expect(events.length).toBe(1);
      expect(events[0]?.vendorUserId).toBe('EMP-5544');
      expect(events[0]?.source).toBe('PUSH');
    });
  });

  describe('5. HikvisionDeviceAdapter Contract Compliance', () => {
    const adapter = new HikvisionDeviceAdapter();

    it('should declare biometric capabilities', () => {
      expect(adapter.vendor).toBe(DeviceVendor.HIKVISION);
      expect(adapter.capabilities).toContain(DeviceCapability.PULL_LOGS);
      expect(adapter.capabilities).toContain(DeviceCapability.PUSH_LOGS);
      expect(adapter.capabilities).toContain(DeviceCapability.REALTIME_EVENTS);
      expect(adapter.capabilities).toContain(DeviceCapability.FACE);
      expect(adapter.capabilities).toContain(DeviceCapability.FINGERPRINT);
      expect(adapter.capabilities).toContain(DeviceCapability.CARD);
    });

    it('should test connection with simulation fallback', async () => {
      const result = await adapter.testConnection(sampleDevice);
      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeDefined();
      expect(result.serialNumber).toBeDefined();
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

    it('should query RTC clock and system device info', async () => {
      const clock = await adapter.getClock(sampleDevice);
      expect(clock.synchronized).toBe(true);

      const info = await adapter.getDeviceInfo(sampleDevice);
      expect(info).toBeDefined();
    });
  });
});
