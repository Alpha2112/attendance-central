import { describe, it, expect } from 'vitest';
import { DeviceSimulator, MockDeviceAdapter, FailureMode } from '../index.js';
import {
  RawAttendanceEventSchema,
  type RawAttendanceEvent,
  DeviceVendor,
  PunchType,
  VerificationType,
  DeviceStatus,
  CommandType,
  CommandStatus,
} from '@attendance/contracts';

describe('Mock Device Lab & Simulators', () => {
  const baseConfig = {
    organizationId: '10',
    branchId: '101',
    deviceId: '201',
    deviceSerialNumber: 'ZK-TEST-001',
    vendor: DeviceVendor.ZKTECO,
    adapter: 'zkteco-standalone',
  };

  it('should generate a valid RawAttendanceEvent passing Zod schema validation', () => {
    const simulator = new DeviceSimulator(baseConfig);
    const punch = simulator.generatePunch({
      vendorUserId: '457',
      punchType: PunchType.IN,
      verificationType: VerificationType.FINGERPRINT,
    });

    const parsed = RawAttendanceEventSchema.safeParse(punch);
    expect(parsed.success).toBe(true);
    expect(punch.vendorUserId).toBe('457');
    expect(punch.organizationId).toBe('10');
    expect(punch.deviceId).toBe('201');
  });

  it('should generate 10 duplicate copies of one logical punch', () => {
    const simulator = new DeviceSimulator(baseConfig);
    const basePunch = simulator.generatePunch({
      vendorUserId: '457',
      deviceTime: '2026-08-15T08:00:00.000Z',
    });

    const duplicates = simulator.generateDuplicates(basePunch, 10);
    expect(duplicates.length).toBe(10);

    // Verify all 10 have different eventIds (unique delivery attempts) but same logical punch payload
    const eventIds = new Set(duplicates.map((d) => d.eventId));
    expect(eventIds.size).toBe(10);

    for (const dup of duplicates) {
      expect(dup.vendorUserId).toBe('457');
      expect(dup.deviceTime).toBe('2026-08-15T08:00:00.000Z');
      expect(dup.deviceId).toBe('201');
      expect(RawAttendanceEventSchema.safeParse(dup).success).toBe(true);
    }
  });

  it('should model 8-hour offline history followed by replay with clock drift', () => {
    const simulator = new DeviceSimulator(baseConfig);
    const result = simulator.simulateOfflinePeriod(8, 20, 120); // 8 hours, 20 punches/hour, 120s drift

    expect(result.punches.length).toBe(160);
    expect(result.clockDriftSecondsApplied).toBe(120);
    expect(result.deviceStatusTransitions.length).toBe(2);
    expect(result.deviceStatusTransitions[0]?.status).toBe(DeviceStatus.OFFLINE);
    expect(result.deviceStatusTransitions[1]?.status).toBe(DeviceStatus.ONLINE);

    // All punches must satisfy RawAttendanceEvent contract
    for (const p of result.punches) {
      const parsed = RawAttendanceEventSchema.safeParse(p);
      expect(parsed.success).toBe(true);
      expect(p.metadata?.offlineBuffered).toBe(true);
    }
  });

  it('should simulate out-of-order punches', () => {
    const simulator = new DeviceSimulator(baseConfig);
    const batch = simulator.generateBatch(10, { intervalSeconds: 60 });
    const shuffled = simulator.simulateOutOfOrder(batch);

    expect(shuffled.length).toBe(10);
    // Check that timestamps are no longer strictly ascending
    let isOutOfOrder = false;
    for (let i = 0; i < shuffled.length - 1; i++) {
      if (
        new Date(shuffled[i]!.deviceTime).getTime() >
        new Date(shuffled[i + 1]!.deviceTime).getTime()
      ) {
        isOutOfOrder = true;
        break;
      }
    }
    expect(isOutOfOrder).toBe(true);
  });

  it('should simulate malformed payloads for robustness testing', () => {
    const simulator = new DeviceSimulator(baseConfig);
    const missingUser = simulator.simulateMalformedPayload('MISSING_USER_ID');
    const invalidDate = simulator.simulateMalformedPayload('INVALID_DATE');

    // These should be rejected by strict RawAttendanceEvent schema
    expect(RawAttendanceEventSchema.safeParse(missingUser).success).toBe(false);
    expect(RawAttendanceEventSchema.safeParse(invalidDate).success).toBe(false);
  });

  it('should manage MockDeviceAdapter connection, status, and commands', async () => {
    const adapter = new MockDeviceAdapter(baseConfig);

    expect(adapter.getStatus().status).toBe(DeviceStatus.OFFLINE);

    await adapter.connect();
    expect(adapter.getStatus().status).toBe(DeviceStatus.ONLINE);

    const cmdResult = await adapter.executeCommand('cmd-1', CommandType.SYNC_TIME);
    expect(cmdResult.status).toBe(CommandStatus.EXECUTED);

    let receivedEvent: RawAttendanceEvent | null = null;
    const unsubscribe = adapter.subscribeRealtime((event) => {
      receivedEvent = event;
    });

    const simulator = new DeviceSimulator(baseConfig);
    const punch = simulator.generatePunch();
    adapter.emitRealtime(punch);

    expect(receivedEvent).toBeDefined();
    expect((receivedEvent as unknown as RawAttendanceEvent).eventId).toBe(punch.eventId);

    unsubscribe();
    await adapter.disconnect();
    expect(adapter.getStatus().status).toBe(DeviceStatus.OFFLINE);
  });

  it('should simulate failure modes like timeout and auth failure on MockDeviceAdapter', async () => {
    const timeoutAdapter = new MockDeviceAdapter({
      ...baseConfig,
      failureMode: FailureMode.TIMEOUT,
    });
    await expect(timeoutAdapter.connect()).rejects.toThrow(/timeout/i);

    const authFailAdapter = new MockDeviceAdapter({
      ...baseConfig,
      failureMode: FailureMode.AUTH_FAILURE,
    });
    await expect(authFailAdapter.connect()).rejects.toThrow(/authentication failure/i);
    expect(authFailAdapter.getStatus().status).toBe(DeviceStatus.AUTH_ERROR);
  });
});
