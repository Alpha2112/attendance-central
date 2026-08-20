import { describe, it, expect } from 'vitest';
import {
  calculateZkChecksum,
  buildZkPacket,
  parseZkPacket,
  decodeZkTimestamp,
  encodeZkTimestamp,
  ZKCommand,
  classifyZKError,
  ZKErrorCategory,
  ZKTecoAdmsPushHandler,
  ZKTecoDeviceAdapter,
} from '../index.js';
import {
  type DeviceModel,
  DeviceStatus,
  DeviceVendor,
  DeviceCapability,
} from '@attendance/contracts';

describe('ZKTeco Connector & Adapter Suite', () => {
  const sampleDevice: DeviceModel = {
    id: 'DEV-HQ-ZK01',
    organizationId: 'ORG-TECHIVE',
    branchId: 'BR-HQ-01',
    deviceCode: 'DEV-HQ-ZK01',
    serialNumber: 'ZK-SN-99881122',
    name: 'ZKTeco Main Entrance',
    vendor: 'ZKTECO',
    protocol: 'ADMS',
    connectionMode: 'HYBRID',
    status: DeviceStatus.ONLINE,
    host: '127.0.0.1',
    port: 4370,
    timezone: 'UTC',
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  };

  describe('1. Binary Packet Protocol & Framing', () => {
    it('should calculate valid 16-bit one-complement checksum', () => {
      const buffer = Buffer.from([0xe8, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // CMD_CONNECT
      const checksum = calculateZkChecksum(buffer);
      expect(typeof checksum).toBe('number');
      expect(checksum).toBeGreaterThan(0);
      expect(checksum).toBeLessThanOrEqual(0xffff);
    });

    it('should build and parse ZKTeco TCP packet envelope', () => {
      const commandId = ZKCommand.CMD_CONNECT;
      const sessionId = 1234;
      const replyId = 1;
      const payload = Buffer.from('TEST_PAYLOAD');

      const packet = buildZkPacket(commandId, sessionId, replyId, payload);
      expect(packet.length).toBeGreaterThan(16);

      const decoded = parseZkPacket(packet);
      expect(decoded.commandId).toBe(commandId);
      expect(decoded.header.sessionId).toBe(sessionId);
      expect(decoded.header.replyId).toBe(replyId);
      expect(decoded.payload.toString()).toBe('TEST_PAYLOAD');
    });

    it('should encode and decode 32-bit packed attendance timestamp accurately', () => {
      const date = new Date('2026-08-16T14:30:45.000Z');
      const encoded = encodeZkTimestamp(date);
      expect(encoded).toBeGreaterThan(0);

      const decodedIso = decodeZkTimestamp(encoded);
      expect(decodedIso).toBe('2026-08-16T14:30:45.000Z');
    });
  });

  describe('2. Error Classification', () => {
    it('should classify unauthorized errors as PERMANENT and non-retryable', () => {
      const result = classifyZKError(new Error('Authentication failed: Invalid commKey'));
      expect(result.category).toBe(ZKErrorCategory.PERMANENT);
      expect(result.isRetryable).toBe(false);
    });

    it('should classify buffer overflow as HARDWARE error', () => {
      const result = classifyZKError(new Error('Hardware buffer overflow on attendance log queue'));
      expect(result.category).toBe(ZKErrorCategory.HARDWARE);
      expect(result.isRetryable).toBe(false);
    });

    it('should classify timeout and network drops as TRANSIENT and retryable', () => {
      const result = classifyZKError(new Error('TCP connection timeout after 5000ms'));
      expect(result.category).toBe(ZKErrorCategory.TRANSIENT);
      expect(result.isRetryable).toBe(true);
    });
  });

  describe('3. ADMS / ICLOCK HTTP Push Ingestion', () => {
    const handler = new ZKTecoAdmsPushHandler();

    it('should parse standard tab-separated ADMS punch records', () => {
      const bodyText = [
        '457\t2026-08-16 08:30:00\t0\t1\t0\t0',
        '892\t2026-08-16 08:31:15\t0\t15\t0\t0',
        '457\t2026-08-16 17:05:20\t1\t1\t0\t0',
      ].join('\n');

      const result = handler.parseAttLogBody(sampleDevice, bodyText);
      expect(result.validCount).toBe(3);
      expect(result.skippedCount).toBe(0);
      expect(result.responseBody).toBe('OK: 3');

      expect(result.events[0]).toMatchObject({
        vendorUserId: '457',
        vendorPunchType: '0',
        vendorVerificationType: '1',
        vendor: DeviceVendor.ZKTECO,
        adapter: 'zkteco-adms',
        source: 'PUSH',
      });
      expect(result.events[1]?.vendorVerificationType).toBe('15'); // Face
    });

    it('should parse key-value formatted ADMS push stream', () => {
      const bodyText = 'PIN=1001\tCHECKTIME=2026-08-16 09:00:00\tCHECKTYPE=0\tVERIFYCODE=4';
      const result = handler.parseAttLogBody(sampleDevice, bodyText);

      expect(result.validCount).toBe(1);
      expect(result.events[0]?.vendorUserId).toBe('1001');
      expect(result.events[0]?.vendorVerificationType).toBe('4'); // Card
    });

    it('should safely skip empty or corrupt lines without failing the batch', () => {
      const bodyText = [
        '',
        'INVALID_CORRUPTED_LINE_WITHOUT_TIMESTAMP',
        '457\t2026-08-16 08:30:00\t0\t1',
        '   ',
      ].join('\n');

      const result = handler.parseAttLogBody(sampleDevice, bodyText);
      expect(result.validCount).toBe(1);
      expect(result.skippedCount).toBe(1);
    });
  });

  describe('4. ZKTecoDeviceAdapter End-to-End Contract', () => {
    const adapter = new ZKTecoDeviceAdapter();

    it('should declare full biometric capabilities', () => {
      expect(adapter.vendor).toBe(DeviceVendor.ZKTECO);
      expect(adapter.capabilities).toContain(DeviceCapability.PULL_LOGS);
      expect(adapter.capabilities).toContain(DeviceCapability.PUSH_LOGS);
      expect(adapter.capabilities).toContain(DeviceCapability.CLOCK_READ);
      expect(adapter.capabilities).toContain(DeviceCapability.CLOCK_WRITE);
      expect(adapter.capabilities).toContain(DeviceCapability.DEVICE_STATUS);
      expect(adapter.capabilities).toContain(DeviceCapability.FINGERPRINT);
      expect(adapter.capabilities).toContain(DeviceCapability.FACE);
    });

    it('should test connection successfully with simulation fallback', async () => {
      const result = await adapter.testConnection(sampleDevice);
      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeDefined();
    });

    it('should fetch incremental logs and advance cursor', async () => {
      const fetchResult = await adapter.fetchLogs(sampleDevice, {
        lastLogTimestamp: '2026-08-16T08:00:00.000Z',
        lastLogIndex: 10,
      });

      expect(fetchResult.events.length).toBe(5);
      expect(fetchResult.nextCursor).toBeDefined();
      expect(fetchResult.nextCursor?.lastLogIndex).toBe(15);
      expect(fetchResult.events[0]?.vendor).toBe(DeviceVendor.ZKTECO);
    });

    it('should inspect and synchronize device clock', async () => {
      const clock = await adapter.getClock(sampleDevice);
      expect(clock.synchronized).toBe(true);
      expect(clock.driftSeconds).toBeDefined();

      await expect(adapter.setClock(sampleDevice, new Date())).resolves.not.toThrow();
    });

    it('should handle push streams via handlePush interface', async () => {
      const bodyText = '999\t2026-08-16 12:00:00\t0\t1\t0\t0';
      const pushedEvents = await adapter.handlePush({ device: sampleDevice, bodyText });

      expect(pushedEvents.length).toBe(1);
      expect(pushedEvents[0]?.vendorUserId).toBe('999');
    });
  });
});
