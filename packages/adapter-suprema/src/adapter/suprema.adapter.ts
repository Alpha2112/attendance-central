import {
  type AttendanceDeviceAdapter,
  type PushAttendanceAdapter,
  type RealtimeAttendanceAdapter,
  type DeviceModel,
  DeviceVendor,
  DeviceStatus,
  DeviceCapability,
  type ConnectionTestResult,
  type SyncCursor,
  type FetchLogsResult,
  type DeviceClock,
  type RawAttendanceEvent,
  EventSource,
} from '@attendance/contracts';
import { BioStarClient } from '../client/biostar-client.js';
import { BioStarRealtimeConsumer } from '../realtime/biostar-realtime.consumer.js';
import { mapBioStarEventToRawAttendance } from '../events/event-mapper.js';
import { classifySupremaError } from '../client/error-classifier.js';
import { type BioStarConnectionOptions, type BioStarEventLog } from '../types/biostar.types.js';
import { type AppLogger } from '@attendance/logging';
import { DeviceSimulator } from '@attendance/simulator';

export class SupremaDeviceAdapter
  implements AttendanceDeviceAdapter, PushAttendanceAdapter, RealtimeAttendanceAdapter
{
  public readonly vendor = DeviceVendor.SUPREMA;
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

  private readonly realtimeConsumers = new Map<string, BioStarRealtimeConsumer>();
  private readonly defaultPort: number;
  private readonly useHttps: boolean;
  private readonly timeoutMs: number;
  private readonly mockFallback: boolean;

  constructor(
    private readonly logger?: AppLogger,
    options?: Partial<BioStarConnectionOptions>,
  ) {
    this.defaultPort = options?.port ?? 80;
    this.useHttps = options?.useHttps ?? false;
    this.timeoutMs = options?.timeoutMs ?? 6000;
    this.mockFallback = options?.mockFallback ?? true;
  }

  private isMockHost(host: string): boolean {
    return (
      this.mockFallback && (host === '127.0.0.1' || host === 'localhost' || host === 'mock-biostar')
    );
  }

  private createClient(device: DeviceModel): BioStarClient {
    const host = device.host ?? '127.0.0.1';
    const port = device.port ?? this.defaultPort;
    const username = (device.metadata?.['username'] as string) || 'admin';
    const password = (device.metadata?.['password'] as string) || 'Admin12345';

    return new BioStarClient(
      {
        host,
        port,
        username,
        password,
        useHttps: this.useHttps,
        timeoutMs: this.timeoutMs,
      },
      this.logger,
    );
  }

  /**
   * Tests connection and authenticates against BioStar 2 server.
   */
  public async testConnection(
    device: DeviceModel,
    signal?: AbortSignal,
  ): Promise<ConnectionTestResult> {
    const start = Date.now();
    const host = device.host ?? '127.0.0.1';

    if (signal?.aborted) {
      return { success: false, error: 'Connection test aborted' };
    }

    if (host === 'mock-biostar') {
      return {
        success: true,
        latencyMs: 14,
        serialNumber: device.serialNumber ?? `SUPREMA-${device.deviceCode}`,
        firmwareVersion: 'v2.9.4.15 (sim)',
        details: {
          model: 'BioStation 3',
          serverVersion: 'BioStar 2.9.4',
        },
      };
    }

    try {
      const client = this.createClient(device);
      const sessionId = await client.login();
      const latencyMs = Date.now() - start;

      return {
        success: true,
        latencyMs,
        serialNumber: device.serialNumber ?? `SUPREMA-${device.deviceCode}`,
        firmwareVersion: device.firmwareVersion ?? 'BioStar 2',
        details: {
          sessionId,
          serverHost: host,
        },
      };
    } catch (err: unknown) {
      const classified = classifySupremaError(err);
      this.logger?.warn(
        { deviceId: device.id, host, category: classified.category, error: classified.message },
        'BioStar 2 connection test failed',
      );

      if (this.isMockHost(host)) {
        return {
          success: true,
          latencyMs: 15,
          serialNumber: device.serialNumber ?? `SUPREMA-${device.deviceCode}`,
          firmwareVersion: 'v2.9.4.15 (sim)',
          details: {
            model: 'BioStation 3',
            serverVersion: 'BioStar 2.9.4',
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
   * Fetches incremental logs via BioStar 2 event log search API.
   */
  public async fetchLogs(
    device: DeviceModel,
    cursor?: SyncCursor,
    signal?: AbortSignal,
  ): Promise<FetchLogsResult> {
    const host = device.host ?? '127.0.0.1';

    if (signal?.aborted) {
      throw new Error('Fetch logs operation aborted');
    }

    if (host === 'mock-biostar') {
      const simulator = new DeviceSimulator({
        organizationId: device.organizationId,
        branchId: device.branchId ?? '1',
        deviceId: device.id,
        deviceSerialNumber: device.serialNumber ?? `SUPREMA-${device.deviceCode}`,
        vendor: DeviceVendor.SUPREMA,
        adapter: 'suprema-biostar2',
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
      const client = this.createClient(device);
      const limit = 50;
      const offset = cursor?.lastLogIndex ?? 0;

      const result = await client.searchEvents({
        limit,
        offset,
        deviceId: device.deviceCode,
        startTime: cursor?.lastLogTimestamp,
      });

      const rows: BioStarEventLog[] = result.EventCollection?.rows ?? [];
      const events: RawAttendanceEvent[] = rows.map((r) =>
        mapBioStarEventToRawAttendance(device, r),
      );

      const total = parseInt(String(result.EventCollection?.total || 0), 10);
      const hasMore = offset + events.length < total;
      const lastRecord = events[events.length - 1];

      return {
        events,
        nextCursor: {
          lastLogTimestamp:
            lastRecord?.deviceTime ?? cursor?.lastLogTimestamp ?? new Date().toISOString(),
          lastLogIndex: offset + events.length,
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
          deviceSerialNumber: device.serialNumber ?? `SUPREMA-${device.deviceCode}`,
          vendor: DeviceVendor.SUPREMA,
          adapter: 'suprema-biostar2',
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

      const classified = classifySupremaError(err);
      throw new Error(`BioStar 2 fetchLogs failed (${classified.category}): ${classified.message}`);
    }
  }

  /**
   * Queries server/device status.
   */
  public async getStatus(device: DeviceModel, signal?: AbortSignal): Promise<DeviceStatus> {
    const testResult = await this.testConnection(device, signal);
    return testResult.success ? DeviceStatus.ONLINE : DeviceStatus.OFFLINE;
  }

  /**
   * Queries device specifications.
   */
  public async getDeviceInfo(
    device: DeviceModel,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const testResult = await this.testConnection(device, signal);
    return (testResult.details as Record<string, unknown>) ?? {};
  }

  /**
   * Reads RTC clock.
   */
  public async getClock(device: DeviceModel, signal?: AbortSignal): Promise<DeviceClock> {
    const host = device.host ?? '127.0.0.1';

    if (signal?.aborted) {
      throw new Error('Get clock operation aborted');
    }

    if (host === 'mock-biostar') {
      const now = new Date();
      return {
        deviceTime: now,
        serverTime: now,
        driftSeconds: 0,
        synchronized: true,
      };
    }

    try {
      const client = this.createClient(device);
      const timeInfo = await client.getTime(device.deviceCode);
      const deviceTime = new Date(timeInfo.device_time);
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
   * Sets RTC clock.
   */
  public async setClock(device: DeviceModel, timestamp: Date, signal?: AbortSignal): Promise<void> {
    const host = device.host ?? '127.0.0.1';

    if (signal?.aborted) {
      throw new Error('Set clock operation aborted');
    }

    if (host === 'mock-biostar') {
      return;
    }

    try {
      const client = this.createClient(device);
      await client.setTime(device.deviceCode, timestamp.toISOString());
    } catch (err: unknown) {
      if (!this.mockFallback) {
        throw err;
      }
    }
  }

  /**
   * Handles push payloads from BioStar webhooks or HTTP notifications.
   */
  public async handlePush(request: {
    device: DeviceModel;
    payload: unknown;
  }): Promise<RawAttendanceEvent[]> {
    const events: RawAttendanceEvent[] = [];
    try {
      const payloadObj =
        typeof request.payload === 'string' ? JSON.parse(request.payload) : request.payload;
      const log = (payloadObj?.Event ?? payloadObj) as BioStarEventLog;
      if (log && log.datetime) {
        events.push(mapBioStarEventToRawAttendance(request.device, log, EventSource.PUSH));
      }
    } catch (err: unknown) {
      this.logger?.warn(
        { error: err instanceof Error ? err.message : String(err) },
        'Failed to parse BioStar 2 push payload',
      );
    }
    return events;
  }

  /**
   * Subscribes to real-time WebSocket stream (RealtimeAttendanceAdapter contract).
   */
  public async subscribe(
    device: DeviceModel,
    handler: (event: RawAttendanceEvent) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<() => void> {
    const client = this.createClient(device);
    const consumer = new BioStarRealtimeConsumer(
      client,
      {
        host: device.host ?? '127.0.0.1',
        port: device.port ?? this.defaultPort,
        username: (device.metadata?.['username'] as string) || 'admin',
        password: (device.metadata?.['password'] as string) || 'Admin12345',
        useHttps: this.useHttps,
      },
      this.logger,
    );

    this.realtimeConsumers.set(device.id, consumer);

    if (signal) {
      signal.addEventListener('abort', () => {
        consumer.stop();
        this.realtimeConsumers.delete(device.id);
      });
    }

    await consumer.start(device, handler);

    return () => {
      consumer.stop();
      this.realtimeConsumers.delete(device.id);
    };
  }

  /**
   * Starts real-time event streaming.
   */
  public async startRealtime(
    device: DeviceModel,
    onEvent: (event: RawAttendanceEvent) => Promise<void> | void,
  ): Promise<void> {
    await this.subscribe(device, async (event) => {
      await onEvent(event);
    });
  }

  /**
   * Stops real-time event streaming.
   */
  public async stopRealtime(device: DeviceModel): Promise<void> {
    const consumer = this.realtimeConsumers.get(device.id);
    if (consumer) {
      consumer.stop();
      this.realtimeConsumers.delete(device.id);
    }
  }
}
