import {
  type AttendanceDeviceAdapter,
  type PushAttendanceAdapter,
  type DeviceModel,
  DeviceVendor,
  DeviceStatus,
  DeviceCapability,
  type ConnectionTestResult,
  type SyncCursor,
  type FetchLogsResult,
  type DeviceClock,
  type RawAttendanceEvent,
} from '@attendance/contracts';
import { ISAPIClient } from '../client/isapi-client.js';
import { mapHikvisionEventToRawAttendance } from '../events/event-mapper.js';
import { HikvisionAlertStreamParser } from '../events/alert-stream.parser.js';
import { classifyHikvisionError } from '../client/error-classifier.js';
import { type AppLogger } from '@attendance/logging';
import { DeviceSimulator } from '@attendance/simulator';
import { randomUUID } from 'node:crypto';

export interface HikvisionAdapterOptions {
  defaultPort?: number;
  useHttps?: boolean;
  timeoutMs?: number;
  mockFallback?: boolean;
}

/** Formats a date/ISO string as Hikvision ISAPI expects: `YYYY-MM-DDThh:mm:ss+00:00`
 *  (ISO-8601 with an explicit offset, no milliseconds, no bare "Z"). */
function toIsapiTime(input: string | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+00:00`
  );
}

/**
 * Enterprise Hikvision Device Adapter implementing AttendanceDeviceAdapter & PushAttendanceAdapter.
 */
export class HikvisionDeviceAdapter implements AttendanceDeviceAdapter, PushAttendanceAdapter {
  public readonly vendor = DeviceVendor.HIKVISION;
  public readonly capabilities: readonly DeviceCapability[] = [
    DeviceCapability.PULL_LOGS,
    DeviceCapability.PUSH_LOGS,
    DeviceCapability.REALTIME_EVENTS,
    DeviceCapability.CLOCK_READ,
    DeviceCapability.CLOCK_WRITE,
    DeviceCapability.DEVICE_STATUS,
    DeviceCapability.FACE,
    DeviceCapability.FINGERPRINT,
    DeviceCapability.CARD,
    DeviceCapability.PIN,
  ];

  private readonly alertStreamParser: HikvisionAlertStreamParser;
  private readonly defaultPort: number;
  private readonly useHttps: boolean;
  private readonly timeoutMs: number;
  private readonly mockFallback: boolean;

  constructor(
    private readonly logger?: AppLogger,
    options?: HikvisionAdapterOptions,
  ) {
    this.alertStreamParser = new HikvisionAlertStreamParser(logger);
    this.defaultPort = options?.defaultPort ?? 80;
    this.useHttps = options?.useHttps ?? false;
    this.timeoutMs = options?.timeoutMs ?? 5000;
    this.mockFallback = options?.mockFallback ?? true;
  }

  private isMockHost(host: string): boolean {
    return (
      this.mockFallback &&
      (host === '127.0.0.1' || host === 'localhost' || host === 'mock-hikvision')
    );
  }

  /**
   * Tests reachability and retrieves system device info from Hikvision terminal.
   */
  public async testConnection(
    device: DeviceModel,
    signal?: AbortSignal,
  ): Promise<ConnectionTestResult> {
    const start = Date.now();
    const host = device.host ?? '127.0.0.1';
    let port = device.port ?? (this.useHttps ? 443 : this.defaultPort);
    if (port === 8000) {
      port = 80; // Map SADP command port 8000 to HTTP ISAPI port 80
    }

    if (signal?.aborted) {
      return { success: false, error: 'Connection test aborted' };
    }

    if (host === 'mock-hikvision') {
      return {
        success: true,
        latencyMs: 10,
        serialNumber: device.serialNumber ?? `HIK-${device.deviceCode}`,
        firmwareVersion: 'V3.2.30_build230510 (sim)',
        details: {
          model: 'DS-K1T341AMF',
          macAddress: '48:ea:63:11:22:33',
        },
      };
    }

    try {
      const client = new ISAPIClient(
        {
          host,
          port,
          username: (device.metadata?.['username'] as string) || 'admin',
          password: (device.metadata?.['password'] as string) || 'Admin12345',
          useHttps: this.useHttps,
          timeoutMs: this.timeoutMs,
        },
        this.logger,
      );

      const info = await client.getDeviceInfo();
      const latencyMs = Date.now() - start;

      return {
        success: true,
        latencyMs,
        serialNumber: info.serialNumber || device.serialNumber || undefined,
        firmwareVersion: info.firmwareVersion || device.firmwareVersion || undefined,
        details: {
          model: info.model,
          macAddress: info.macAddress,
          deviceName: info.deviceName,
        },
      };
    } catch (err: unknown) {
      const classified = classifyHikvisionError(err);
      this.logger?.warn(
        {
          deviceId: device.id,
          host,
          port,
          category: classified.category,
          error: classified.message,
        },
        'Hikvision ISAPI connection test failed',
      );

      // Simulation / mock fallback for local development
      if (this.isMockHost(host)) {
        return {
          success: true,
          latencyMs: 12,
          serialNumber: device.serialNumber ?? `HIK-${device.deviceCode}`,
          firmwareVersion: 'V3.2.30_build230510 (sim)',
          details: {
            model: 'DS-K1T341AMF',
            macAddress: '48:ea:63:11:22:33',
          },
        };
      }

      return {
        success: false,
        error: classified.message,
        latencyMs: Date.now() - start,
      };
    }
  }

  /**
   * Pulls incremental attendance logs via ISAPI AcsEvent search.
   */
  public async fetchLogs(
    device: DeviceModel,
    cursor?: SyncCursor,
    signal?: AbortSignal,
  ): Promise<FetchLogsResult> {
    const host = device.host ?? '127.0.0.1';
    let port = device.port ?? (this.useHttps ? 443 : this.defaultPort);
    if (port === 8000) {
      port = 80;
    }

    if (signal?.aborted) {
      throw new Error('Fetch logs operation aborted');
    }

    if (host === 'mock-hikvision') {
      const simulator = new DeviceSimulator({
        organizationId: device.organizationId,
        branchId: device.branchId ?? '1',
        deviceId: device.id,
        deviceSerialNumber: device.serialNumber ?? `HIK-${device.deviceCode}`,
        vendor: DeviceVendor.HIKVISION,
        adapter: 'hikvision-isapi',
      });

      const simBatch = simulator.generateBatch(5, {
        startTime: cursor?.lastLogTimestamp ? new Date(cursor.lastLogTimestamp) : undefined,
      });

      const lastItem = simBatch[simBatch.length - 1];
      return {
        events: simBatch,
        nextCursor: {
          lastLogTimestamp: lastItem?.deviceTime ?? new Date().toISOString(),
          lastLogIndex: (cursor?.lastLogIndex ?? 0) + simBatch.length,
        },
        hasMore: false,
        checkpoint: lastItem?.deviceTime,
      };
    }

    try {
      const client = new ISAPIClient(
        {
          host,
          port,
          username: (device.metadata?.['username'] as string) || 'admin',
          password: (device.metadata?.['password'] as string) || 'Admin12345',
          useHttps: this.useHttps,
          timeoutMs: this.timeoutMs,
        },
        this.logger,
      );

      const searchPosition = cursor?.lastLogIndex ?? 0;
      // Hikvision AcsEvent time search needs ISO-8601 with a timezone offset
      // (e.g. 2026-11-20T00:00:00+00:00) and requires startTime AND endTime
      // together — sending only startTime (or a "…000Z" form) is rejected as
      // badJsonContent. endTime comes from cursor.custom.endTime (manual date
      // range) or defaults to "now" for incremental pulls.
      const startTime = cursor?.lastLogTimestamp ? toIsapiTime(cursor.lastLogTimestamp) : undefined;
      const endRaw = cursor?.custom?.['endTime'];
      const endTime = startTime
        ? toIsapiTime(typeof endRaw === 'string' ? endRaw : new Date())
        : undefined;
      const searchResult = await client.searchAcsEvents({
        searchID: randomUUID(),
        searchResultPosition: searchPosition,
        maxResults: 30,
        major: 5,
        startTime,
        endTime,
      });

      const records = searchResult.AcsEvent?.InfoList ?? [];
      const events: RawAttendanceEvent[] = records.map((r) =>
        mapHikvisionEventToRawAttendance(device, r),
      );

      const hasMore = searchResult.AcsEvent?.responseStatusStrg === 'MORE';
      const lastRecord = events[events.length - 1];

      return {
        events,
        nextCursor: {
          lastLogTimestamp:
            lastRecord?.deviceTime ?? cursor?.lastLogTimestamp ?? new Date().toISOString(),
          lastLogIndex: searchPosition + events.length,
        },
        hasMore,
        checkpoint: lastRecord?.deviceTime,
      };
    } catch (err: unknown) {
      if (this.isMockHost(host)) {
        const simulator = new DeviceSimulator({
          organizationId: device.organizationId,
          branchId: device.branchId ?? '1',
          deviceId: device.id,
          deviceSerialNumber: device.serialNumber ?? `HIK-${device.deviceCode}`,
          vendor: DeviceVendor.HIKVISION,
          adapter: 'hikvision-isapi',
        });

        const simBatch = simulator.generateBatch(5, {
          startTime: cursor?.lastLogTimestamp ? new Date(cursor.lastLogTimestamp) : undefined,
        });

        const lastItem = simBatch[simBatch.length - 1];
        return {
          events: simBatch,
          nextCursor: {
            lastLogTimestamp: lastItem?.deviceTime ?? new Date().toISOString(),
            lastLogIndex: (cursor?.lastLogIndex ?? 0) + simBatch.length,
          },
          hasMore: false,
          checkpoint: lastItem?.deviceTime,
        };
      }

      const classified = classifyHikvisionError(err);
      throw new Error(`Hikvision fetchLogs failed (${classified.category}): ${classified.message}`);
    }
  }

  /**
   * Queries hardware status.
   */
  public async getStatus(device: DeviceModel, signal?: AbortSignal): Promise<DeviceStatus> {
    const testResult = await this.testConnection(device, signal);
    return testResult.success ? DeviceStatus.ONLINE : DeviceStatus.OFFLINE;
  }

  /**
   * Queries device hardware information.
   */
  public async getDeviceInfo(
    device: DeviceModel,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const testResult = await this.testConnection(device, signal);
    return (testResult.details as Record<string, unknown>) ?? {};
  }

  /**
   * Reads RTC clock from device.
   */
  public async getClock(device: DeviceModel, signal?: AbortSignal): Promise<DeviceClock> {
    const host = device.host ?? '127.0.0.1';
    const port = device.port ?? (this.useHttps ? 443 : this.defaultPort);

    if (signal?.aborted) {
      throw new Error('Get clock operation aborted');
    }

    if (host === 'mock-hikvision') {
      const now = new Date();
      return {
        deviceTime: now,
        serverTime: now,
        driftSeconds: 0,
        synchronized: true,
      };
    }

    try {
      const client = new ISAPIClient(
        {
          host,
          port,
          username: (device.metadata?.['username'] as string) || 'admin',
          password: (device.metadata?.['password'] as string) || 'Admin12345',
          useHttps: this.useHttps,
          timeoutMs: this.timeoutMs,
        },
        this.logger,
      );

      const timeInfo = await client.getTime();
      const deviceTime = new Date(timeInfo.localTime);
      const serverTime = new Date();
      const driftSeconds = Math.abs(
        Math.round((serverTime.getTime() - deviceTime.getTime()) / 1000),
      );

      return {
        deviceTime,
        serverTime,
        driftSeconds,
        synchronized: driftSeconds < 60,
      };
    } catch {
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
   * Sets RTC clock on device.
   */
  public async setClock(device: DeviceModel, timestamp: Date, signal?: AbortSignal): Promise<void> {
    const host = device.host ?? '127.0.0.1';
    const port = device.port ?? (this.useHttps ? 443 : this.defaultPort);

    if (signal?.aborted) {
      throw new Error('Set clock operation aborted');
    }

    if (host === 'mock-hikvision') {
      return;
    }

    try {
      const client = new ISAPIClient(
        {
          host,
          port,
          username: (device.metadata?.['username'] as string) || 'admin',
          password: (device.metadata?.['password'] as string) || 'Admin12345',
          useHttps: this.useHttps,
          timeoutMs: this.timeoutMs,
        },
        this.logger,
      );

      await client.setTime(timestamp.toISOString());
    } catch (err: unknown) {
      if (!this.mockFallback) {
        throw err;
      }
    }
  }

  /**
   * Ingests real-time push events from HTTP notification listeners.
   */
  public async handlePush(request: {
    device: DeviceModel;
    payload: unknown;
  }): Promise<RawAttendanceEvent[]> {
    return this.alertStreamParser.parsePushPayload(request.device, request.payload);
  }
}
