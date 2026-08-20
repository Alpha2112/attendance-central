import {
  type AttendanceDeviceAdapter,
  type DeviceModel,
  DeviceVendor,
  DeviceStatus,
  DeviceCapability,
  type ConnectionTestResult,
  type SyncCursor,
  type FetchLogsResult,
  type DeviceClock,
} from '@attendance/contracts';
import { DeviceSimulator, MockDeviceAdapter } from '@attendance/simulator';
import { type AppLogger } from '@attendance/logging';

export class AdapterNotRegisteredError extends Error {
  constructor(vendorOrKey: string) {
    super(`Device adapter not registered for: '${vendorOrKey}'`);
    this.name = 'AdapterNotRegisteredError';
  }
}

/**
 * Standard Mock Adapter conforming to AttendanceDeviceAdapter.
 */
export class StandardMockDeviceAdapter implements AttendanceDeviceAdapter {
  public readonly vendor = DeviceVendor.ZKTECO;
  public readonly capabilities: readonly DeviceCapability[] = [
    DeviceCapability.PULL_LOGS,
    DeviceCapability.PUSH_LOGS,
    DeviceCapability.REALTIME_EVENTS,
    DeviceCapability.DEVICE_STATUS,
    DeviceCapability.CLOCK_READ,
    DeviceCapability.CLOCK_WRITE,
    DeviceCapability.FINGERPRINT,
    DeviceCapability.FACE,
  ];

  private readonly simulator: DeviceSimulator;
  private readonly adapter: MockDeviceAdapter;

  constructor(config: {
    organizationId: string;
    branchId?: string | null;
    deviceId: string;
    deviceSerialNumber?: string;
    vendor?: DeviceVendor;
  }) {
    const simConfig = {
      organizationId: config.organizationId,
      branchId: config.branchId ?? '1',
      deviceId: config.deviceId,
      deviceSerialNumber: config.deviceSerialNumber ?? `DEV-MOCK-${config.deviceId}`,
      vendor: config.vendor ?? DeviceVendor.ZKTECO,
      adapter: 'mock-standalone',
    };
    this.simulator = new DeviceSimulator(simConfig);
    this.adapter = new MockDeviceAdapter(simConfig);
  }

  public async testConnection(_device: DeviceModel): Promise<ConnectionTestResult> {
    try {
      await this.adapter.connect();
      const statusEvent = this.adapter.getStatus();
      return {
        success: statusEvent.status === DeviceStatus.ONLINE,
        latencyMs: 10,
        firmwareVersion: 'v1.0.0-mock',
        serialNumber: `DEV-MOCK-${_device.id}`,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  public async fetchLogs(_device: DeviceModel, cursor?: SyncCursor): Promise<FetchLogsResult> {
    const count = 5;
    const punches = this.simulator.generateBatch(count, {
      startTime: cursor?.lastLogTimestamp ? new Date(cursor.lastLogTimestamp) : undefined,
    });

    const lastPunch = punches[punches.length - 1];
    return {
      events: punches,
      nextCursor: {
        lastLogTimestamp: lastPunch?.deviceTime ?? new Date().toISOString(),
        lastLogIndex: (cursor?.lastLogIndex ?? 0) + punches.length,
      },
      hasMore: false,
      checkpoint: lastPunch?.deviceTime,
    };
  }

  public async getStatus(_device: DeviceModel): Promise<DeviceStatus> {
    return this.adapter.getStatus().status;
  }

  public async getClock(_device: DeviceModel): Promise<DeviceClock> {
    const now = new Date();
    return {
      deviceTime: now,
      serverTime: now,
      driftSeconds: 0,
      synchronized: true,
    };
  }
}

/**
 * Thread-safe registry mapping vendor/protocol strings to concrete adapter implementations.
 */
export class DeviceAdapterRegistry {
  private readonly adapters = new Map<string, AttendanceDeviceAdapter>();

  constructor(private readonly logger?: AppLogger) {}

  /**
   * Registers an adapter instance under a unique key (e.g. 'ZKTECO', 'HIKVISION:ISAPI', 'MOCK').
   */
  public register(key: string, adapter: AttendanceDeviceAdapter): void {
    const normalizedKey = key.toUpperCase();
    this.adapters.set(normalizedKey, adapter);
    this.logger?.info(
      { key: normalizedKey, vendor: adapter.vendor, capabilities: adapter.capabilities },
      'Registered device adapter in collector registry',
    );
  }

  /**
   * Resolves an adapter for a given device based on vendor and protocol.
   */
  public resolve(device: DeviceModel): AttendanceDeviceAdapter {
    // 1. Try vendor:protocol (e.g. 'ZKTECO:ADMS')
    if (device.protocol) {
      const compositeKey = `${device.vendor}:${device.protocol}`.toUpperCase();
      const adapter = this.adapters.get(compositeKey);
      if (adapter) return adapter;
    }

    // 2. Try vendor alone (e.g. 'ZKTECO')
    const vendorKey = device.vendor.toUpperCase();
    const adapter = this.adapters.get(vendorKey);
    if (adapter) return adapter;

    // 3. Try default mock adapter fallback if key is 'MOCK'
    const mockAdapter = this.adapters.get('MOCK');
    if (mockAdapter) return mockAdapter;

    throw new AdapterNotRegisteredError(
      device.protocol ? `${device.vendor}:${device.protocol}` : device.vendor,
    );
  }

  /**
   * Lists all registered adapter keys.
   */
  public listRegisteredKeys(): string[] {
    return Array.from(this.adapters.keys());
  }
}
