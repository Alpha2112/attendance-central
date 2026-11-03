import { describe, it, expect } from 'vitest';
import { status as GrpcStatus } from '@grpc/grpc-js';
import {
  SupremaDeviceAdapter,
  EventCodeCatalog,
  isPunchEvent,
  mapTnaKeyToPunchType,
  mapGsdkEventToRawAttendance,
  classifySupremaError,
  SupremaErrorCategory,
  type GatewayClient,
  type GsdkEventLog,
  type RealtimeLogStream,
  type StatusChangeStream,
} from '../index.js';
import {
  type DeviceModel,
  DeviceStatus,
  DeviceVendor,
  DeviceCapability,
  PunchType,
  VerificationType,
  EventSource,
} from '@attendance/contracts';

const DEVICE_ID = 538203201;

const sampleDevice: DeviceModel = {
  id: 'DEV-HQ-SUP01',
  organizationId: 'ORG-TECHIVE',
  branchId: 'BR-HQ-01',
  deviceCode: 'DEV-HQ-SUP01',
  serialNumber: 'SUP-BS3-538203201',
  name: 'Suprema BioStation 3',
  vendor: 'SUPREMA',
  protocol: 'GSDK',
  connectionMode: 'REALTIME',
  status: DeviceStatus.ONLINE,
  host: '192.168.1.3',
  port: 51211,
  timezone: 'UTC',
  metadata: { useSSL: false },
  createdAt: '2026-10-27T00:00:00.000Z',
  updatedAt: '2026-10-27T00:00:00.000Z',
};

const catalog = EventCodeCatalog.fromEntries([
  {
    event_code: 4096,
    event_code_str: 'BS2_EVENT_VERIFY_SUCCESS',
    sub_code: 4,
    sub_code_str: 'BS2_SUB_EVENT_VERIFY_ID_FACE',
    desc: '1:1 authentication success(ID + face)',
  },
  {
    event_code: 4864,
    event_code_str: 'BS2_EVENT_IDENTIFY_SUCCESS',
    sub_code: 1,
    sub_code_str: 'BS2_SUB_EVENT_IDENTIFY_FINGER',
    desc: '1:N authentication success(finger)',
  },
]);

function punchLog(id: number, overrides: Partial<GsdkEventLog> = {}): GsdkEventLog {
  return {
    ID: id,
    timestamp: 1_767_000_000, // fixed Unix seconds
    deviceID: DEVICE_ID,
    userID: 'EMP-7788',
    entityID: 0,
    eventCode: 4096,
    subCode: 4,
    TNAKey: 1,
    ...overrides,
  };
}

class FakeStream implements RealtimeLogStream {
  private readonly listeners = new Map<string, Array<(arg: never) => void>>();
  public cancelled = false;

  public on(event: 'data' | 'error' | 'end', listener: (...args: never[]) => void): void {
    const list = this.listeners.get(event) ?? [];
    list.push(listener as (arg: never) => void);
    this.listeners.set(event, list);
  }

  public emit(event: 'data' | 'error' | 'end', arg?: unknown): void {
    for (const l of this.listeners.get(event) ?? []) {
      (l as (a: unknown) => void)(arg);
    }
  }

  public cancel(): void {
    this.cancelled = true;
  }
}

class FakeGatewayClient implements GatewayClient {
  public logs: GsdkEventLog[] = [];
  public readonly stream = new FakeStream();
  public readonly statusStream = new FakeStream();
  public monitoringEnabled = false;
  public enableCount = 0;
  public closed = false;

  public async connectDevice(): Promise<number> {
    return DEVICE_ID;
  }
  public async addAsyncConnection(): Promise<void> {}
  public async disconnectDevice(): Promise<void> {}
  public async getDeviceList(): Promise<[]> {
    return [];
  }
  public async getDeviceInfo(): Promise<{
    modelName: string;
    firmwareVersion: string;
    MACAddr: string;
  }> {
    return { modelName: 'BS3-DB', firmwareVersion: '1.0.1', MACAddr: '00:17:FC:14:54:41' };
  }
  public async getLog(_id: number, start: number, max: number): Promise<GsdkEventLog[]> {
    return this.logs.filter((l) => l.ID >= start).slice(0, max);
  }
  public async enableMonitoring(): Promise<void> {
    this.monitoringEnabled = true;
    this.enableCount += 1;
  }
  public async disableMonitoring(): Promise<void> {
    this.monitoringEnabled = false;
  }
  public subscribeRealtimeLog(): RealtimeLogStream {
    return this.stream;
  }
  public subscribeStatus(): StatusChangeStream {
    return this.statusStream as unknown as StatusChangeStream;
  }
  public async getTime(): Promise<number> {
    return Math.floor(Date.now() / 1000);
  }
  public async setTime(): Promise<void> {}
  public close(): void {
    this.closed = true;
  }
}

function makeAdapter(fake: FakeGatewayClient): SupremaDeviceAdapter {
  return new SupremaDeviceAdapter(undefined, {
    gatewayAddress: '127.0.0.1:4000',
    protoDir: '/nonexistent',
    mockFallback: false,
    clientFactory: () => fake,
  });
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('Suprema G-SDK Adapter Suite', () => {
  describe('1. Event code mapping', () => {
    it('recognizes success events as punches', () => {
      expect(isPunchEvent(4096)).toBe(true); // VERIFY_SUCCESS
      expect(isPunchEvent(4864)).toBe(true); // IDENTIFY_SUCCESS
      expect(isPunchEvent(5632)).toBe(true); // DUAL_AUTH_SUCCESS
      expect(isPunchEvent(6400)).toBe(false); // ACCESS_DENIED
      expect(isPunchEvent(12345)).toBe(false);
    });

    it('maps T&A keys to canonical punch types', () => {
      expect(mapTnaKeyToPunchType(1)).toBe(PunchType.IN);
      expect(mapTnaKeyToPunchType(2)).toBe(PunchType.OUT);
      expect(mapTnaKeyToPunchType(3)).toBe(PunchType.BREAK_OUT);
      expect(mapTnaKeyToPunchType(4)).toBe(PunchType.BREAK_IN);
      expect(mapTnaKeyToPunchType(0)).toBe(PunchType.UNKNOWN);
      expect(mapTnaKeyToPunchType(undefined)).toBe(PunchType.UNKNOWN);
    });

    it('derives verification type from the sub-code', () => {
      expect(catalog.verificationType(4096, 4)).toBe(VerificationType.FACE);
      expect(catalog.verificationType(4864, 1)).toBe(VerificationType.FINGERPRINT);
      expect(catalog.verificationType(9999, 9)).toBe(VerificationType.UNKNOWN);
    });
  });

  describe('2. Event mapper', () => {
    it('converts a G-SDK event log to a RawAttendanceEvent', () => {
      const raw = mapGsdkEventToRawAttendance(
        sampleDevice,
        punchLog(10),
        catalog,
        EventSource.PULL,
      );
      expect(raw.vendor).toBe(DeviceVendor.SUPREMA);
      expect(raw.adapter).toBe('suprema-gsdk');
      expect(raw.vendorUserId).toBe('EMP-7788');
      expect(raw.vendorEventId).toBe(`${DEVICE_ID}:10`);
      expect(raw.vendorPunchType).toBe(PunchType.IN);
      expect(raw.vendorVerificationType).toBe(VerificationType.FACE);
      expect(raw.deviceTime).toBe(new Date(1_767_000_000 * 1000).toISOString());
    });
  });

  describe('3. Error classification', () => {
    it('classifies UNAVAILABLE as transient/retryable', () => {
      const c = classifySupremaError({ code: GrpcStatus.UNAVAILABLE, message: 'No connection' });
      expect(c.category).toBe(SupremaErrorCategory.TRANSIENT);
      expect(c.isRetryable).toBe(true);
    });

    it('classifies UNAUTHENTICATED as permanent/non-retryable', () => {
      const c = classifySupremaError({ code: GrpcStatus.UNAUTHENTICATED, message: 'bad cert' });
      expect(c.category).toBe(SupremaErrorCategory.PERMANENT);
      expect(c.isRetryable).toBe(false);
    });
  });

  describe('4. Adapter contract compliance', () => {
    it('declares the correct vendor and capabilities', () => {
      const adapter = makeAdapter(new FakeGatewayClient());
      expect(adapter.vendor).toBe(DeviceVendor.SUPREMA);
      expect(adapter.capabilities).toContain(DeviceCapability.PULL_LOGS);
      expect(adapter.capabilities).toContain(DeviceCapability.REALTIME_EVENTS);
      expect(adapter.capabilities).toContain(DeviceCapability.CLOCK_READ);
      expect(adapter.capabilities).toContain(DeviceCapability.FACE);
      expect(adapter.capabilities).not.toContain(DeviceCapability.PUSH_LOGS);
    });

    it('tests connection through the gateway', async () => {
      const adapter = makeAdapter(new FakeGatewayClient());
      const result = await adapter.testConnection(sampleDevice);
      expect(result.success).toBe(true);
      expect(result.serialNumber).toBe(String(DEVICE_ID));
      expect((result.details as Record<string, unknown>)['model']).toBe('BS3-DB');
      adapter.close();
    });

    it('falls back to the simulator for mock hosts', async () => {
      const adapter = new SupremaDeviceAdapter(undefined, { mockFallback: true });
      const result = await adapter.testConnection({ ...sampleDevice, host: 'localhost' });
      expect(result.success).toBe(true);
    });

    it('fetches logs, filters non-punch events and advances the cursor', async () => {
      const fake = new FakeGatewayClient();
      fake.logs = [
        punchLog(10),
        { ...punchLog(11), eventCode: 6400, userID: '' }, // ACCESS_DENIED, no user -> filtered
      ];
      const adapter = makeAdapter(fake);
      const result = await adapter.fetchLogs(sampleDevice);
      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.vendorEventId).toBe(`${DEVICE_ID}:10`);
      expect(result.nextCursor?.lastLogIndex).toBe(12); // maxRawId(11) + 1
      expect(result.hasMore).toBe(false);
      adapter.close();
    });

    it('reads the device clock', async () => {
      const adapter = makeAdapter(new FakeGatewayClient());
      const clock = await adapter.getClock(sampleDevice);
      expect(clock.synchronized).toBe(true);
      adapter.close();
    });

    it('subscribes and delivers only real-time punch events', async () => {
      const fake = new FakeGatewayClient();
      const adapter = makeAdapter(fake);
      const received: string[] = [];

      const unsubscribe = await adapter.subscribe(sampleDevice, async (e) => {
        received.push(e.vendorUserId);
      });
      expect(fake.monitoringEnabled).toBe(true);

      fake.stream.emit('data', punchLog(20));
      fake.stream.emit('data', { ...punchLog(21), eventCode: 6400 }); // not a punch
      await flush();

      expect(received).toEqual(['EMP-7788']);
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
      expect(fake.stream.cancelled).toBe(true);
      adapter.close();
    });

    it('re-enables monitoring and reconciles when the device reconnects', async () => {
      const fake = new FakeGatewayClient();
      const adapter = makeAdapter(fake);
      const received: string[] = [];

      await adapter.subscribe(sampleDevice, async (e) => {
        received.push(e.vendorUserId);
      });
      const enableAfterSubscribe = fake.enableCount; // 1

      // A punch recorded while the device was dropped; reconcile should catch it.
      fake.logs = [punchLog(50)];

      // Simulate a Wi-Fi flap: device goes DISCONNECTED (0) then TCP_CONNECTED (1).
      fake.statusStream.emit('data', { deviceID: DEVICE_ID, status: 0, timestamp: 0 });
      fake.statusStream.emit('data', { deviceID: DEVICE_ID, status: 1, timestamp: 0 });
      await flush();
      await flush();

      expect(fake.enableCount).toBeGreaterThan(enableAfterSubscribe); // monitoring re-armed
      expect(received).toContain('EMP-7788'); // missed punch reconciled
      adapter.close();
    });
  });
});
