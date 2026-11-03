import { describe, it, expect, beforeEach } from 'vitest';
import { AnvizDeviceAdapter } from '../adapter/anviz-adapter.js';
import { AnvizClient } from '../client/anviz-client.js';
import { AnvizAuthMode } from '../types/anviz.types.js';
import { VerificationType, PunchType, DeviceStatus, DeviceModel } from '@attendance/contracts';

describe('Anviz Biometric Adapter & Connector Suite', () => {
  let adapter: AnvizDeviceAdapter;
  let client: AnvizClient;

  const sampleDevice: DeviceModel = {
    id: 'DEV-ANVIZ-01',
    organizationId: 'ORG-TECHIVE',
    branchId: 'BR-HQ-01',
    deviceCode: 'DEV-ANVIZ-01',
    serialNumber: 'ANVIZ-SN-9988',
    name: 'Anviz Main Gate',
    vendor: 'ANVIZ',
    connectionMode: 'PUSH',
    status: DeviceStatus.ONLINE,
    timezone: 'UTC',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    adapter = new AnvizDeviceAdapter();
    client = new AnvizClient({ host: '192.168.1.150', port: 5010, deviceSn: 'DEV-ANVIZ-01' });
  });

  it('should test connection and query status', async () => {
    const connResult = await adapter.testConnection(sampleDevice);
    expect(connResult.success).toBe(true);

    const status = await adapter.getStatus(sampleDevice);
    expect(status).toBe(DeviceStatus.ONLINE);
  });

  it('should parse Anviz raw fingerprint payload correctly', () => {
    const raw = {
      userCode: '1001',
      recordTime: '2026-08-20T14:30:00.000Z',
      authMode: 0x01,
      type: 'fingerprint',
    };
    const parsed = client.parseAnvizPayload(raw);
    expect(parsed.userCode).toBe('1001');
    expect(parsed.authMode).toBe(AnvizAuthMode.FINGERPRINT);
    expect(parsed.verifyType).toBe(VerificationType.FINGERPRINT);
  });

  it('should parse Anviz raw face authentication payload correctly', () => {
    const raw = {
      userCode: '2',
      recordTime: '2026-08-20T14:31:00.000Z',
      authMode: 0x03,
      type: 'face',
    };
    const parsed = client.parseAnvizPayload(raw);
    expect(parsed.userCode).toBe('2');
    expect(parsed.authMode).toBe(AnvizAuthMode.FACE);
    expect(parsed.verifyType).toBe(VerificationType.FACE);
  });

  it('should normalize Anviz punch into canonical AttendanceLogItem with SHA-256 fingerprint', async () => {
    const rawRecord = {
      deviceCode: 'DEV-ANVIZ-01',
      deviceSn: 'ANVIZ-SN-001',
      userCode: '1001',
      recordTime: '2026-08-20T14:30:00.000Z',
      authMode: AnvizAuthMode.FINGERPRINT,
      verifyType: VerificationType.FINGERPRINT,
      punchType: PunchType.IN,
    };

    const normalized = await adapter.normalizePunch(rawRecord);
    expect(normalized.vendor).toBe('ANVIZ');
    expect(normalized.employeeId).toBe('EMP-1001');
    expect(normalized.verificationType).toBe(VerificationType.FINGERPRINT);
    expect(normalized.eventFingerprint).toHaveLength(64); // SHA-256 hex length
  });
});
