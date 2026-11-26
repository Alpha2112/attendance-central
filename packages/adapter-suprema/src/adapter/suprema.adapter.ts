import path from 'node:path';
import {
  type AttendanceDeviceAdapter,
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
import { type AppLogger } from '@attendance/logging';
import { DeviceSimulator } from '@attendance/simulator';
import {
  type GatewayClient,
  type GatewayClientFactory,
  type SupremaAdapterOptions,
} from '../types/gsdk.types.js';
import { createGsdkGatewayClient } from '../client/gsdk-client.js';
import { DeviceConnectionManager } from '../connection/device-connection.manager.js';
import { GsdkRealtimeConsumer } from '../realtime/gsdk-realtime.consumer.js';
import { EventCodeCatalog, isPunchEvent } from '../events/event-codes.js';
import { mapGsdkEventToRawAttendance, SUPREMA_ADAPTER_TAG } from '../events/event-mapper.js';
import { classifySupremaError } from '../client/error-classifier.js';

const MOCK_HOSTS = new Set([
  '127.0.0.1',
  'localhost',
  'mock-suprema',
  'mock-biostar',
  'mock-gateway',
]);
// Suprema device event-log IDs grow large over time; use a big page so a full-log
// scan (e.g. a manual historical sync) reaches recent punches in few round-trips.
const FETCH_LIMIT = 256;

/**
 * Enterprise Suprema adapter backed by the official **Suprema G-SDK Device Gateway**.
 *
 * The adapter is a gRPC client of a Device Gateway, which connects to the terminal
 * (BioStation 3, etc.) over Suprema's binary protocol. BioStar 2 is not required.
 */
export class SupremaDeviceAdapter implements AttendanceDeviceAdapter, RealtimeAttendanceAdapter {
  public readonly vendor = DeviceVendor.SUPREMA;
  public readonly capabilities: readonly DeviceCapability[] = [
    DeviceCapability.PULL_LOGS,
    DeviceCapability.REALTIME_EVENTS,
    DeviceCapability.CLOCK_READ,
    DeviceCapability.CLOCK_WRITE,
    DeviceCapability.DEVICE_STATUS,
    DeviceCapability.FACE,
    DeviceCapability.FINGERPRINT,
    DeviceCapability.CARD,
    DeviceCapability.PIN,
  ];

  private readonly gatewayAddress: string;
  private readonly caCertPath?: string;
  private readonly tlsServerName?: string;
  private readonly protoDir: string;
  private readonly timeoutMs: number;
  private readonly useSSL: boolean;
  private readonly defaultDevicePort?: number;
  private readonly mockFallback: boolean;
  private readonly clientFactory: GatewayClientFactory;

  private client: GatewayClient | null = null;
  private connectionManager: DeviceConnectionManager | null = null;
  private catalog: EventCodeCatalog | null = null;
  private readonly realtimeConsumers = new Map<string, GsdkRealtimeConsumer>();

  constructor(
    private readonly logger?: AppLogger,
    options?: SupremaAdapterOptions,
  ) {
    this.gatewayAddress =
      options?.gatewayAddress ?? process.env['SUPREMA_GATEWAY_ADDR'] ?? '127.0.0.1:4000';
    this.caCertPath = options?.caCertPath ?? process.env['SUPREMA_GATEWAY_CA_CERT'] ?? undefined;
    this.tlsServerName =
      options?.tlsServerName ?? process.env['SUPREMA_GATEWAY_TLS_SERVER_NAME'] ?? undefined;
    this.protoDir =
      options?.protoDir ??
      process.env['SUPREMA_GSDK_PROTO_DIR'] ??
      path.resolve(process.cwd(), 'vendor/suprema-gsdk/proto');
    this.timeoutMs = options?.timeoutMs ?? 10_000;
    this.useSSL = options?.useSSL ?? false;
    this.defaultDevicePort = options?.defaultDevicePort;
    this.mockFallback = options?.mockFallback ?? true;
    this.clientFactory = options?.clientFactory ?? ((o) => createGsdkGatewayClient(o, this.logger));
  }

  private isMockHost(host: string): boolean {
    return this.mockFallback && MOCK_HOSTS.has(host) && !process.env['SUPREMA_GATEWAY_ADDR'];
  }

  private getCatalog(): EventCodeCatalog {
    if (!this.catalog) {
      this.catalog = new EventCodeCatalog(undefined, this.logger);
    }
    return this.catalog;
  }

  private getClient(): GatewayClient {
    if (!this.client) {
      this.client = this.clientFactory({
        address: this.gatewayAddress,
        caCertPath: this.caCertPath,
        tlsServerName: this.tlsServerName,
        protoDir: this.protoDir,
        timeoutMs: this.timeoutMs,
      });
    }
    return this.client;
  }

  private getConnectionManager(): DeviceConnectionManager {
    if (!this.connectionManager) {
      this.connectionManager = new DeviceConnectionManager(
        this.getClient(),
        { useSSL: this.useSSL, defaultDevicePort: this.defaultDevicePort },
        this.logger,
      );
    }
    return this.connectionManager;
  }

  private buildSimulator(device: DeviceModel): DeviceSimulator {
    return new DeviceSimulator({
      organizationId: device.organizationId,
      branchId: device.branchId ?? '1',
      deviceId: device.id,
      deviceSerialNumber: device.serialNumber ?? `SUPREMA-${device.deviceCode}`,
      vendor: DeviceVendor.SUPREMA,
      adapter: SUPREMA_ADAPTER_TAG,
    });
  }

  public async testConnection(
    device: DeviceModel,
    signal?: AbortSignal,
  ): Promise<ConnectionTestResult> {
    const start = Date.now();
    const host = device.host ?? '127.0.0.1';

    if (signal?.aborted) {
      return { success: false, error: 'Connection test aborted' };
    }

    if (this.isMockHost(host)) {
      return {
        success: true,
        latencyMs: 14,
        serialNumber: device.serialNumber ?? `SUPREMA-${device.deviceCode}`,
        firmwareVersion: 'v1.0.1 (sim)',
        details: { model: 'BioStation 3', gateway: '(simulated)' },
      };
    }

    try {
      const manager = this.getConnectionManager();
      const deviceId = await manager.ensureConnected(device);
      const info = await this.getClient().getDeviceInfo(deviceId);
      return {
        success: true,
        latencyMs: Date.now() - start,
        serialNumber: String(deviceId),
        firmwareVersion: info.firmwareVersion ?? device.firmwareVersion ?? 'Suprema G-SDK',
        details: {
          gatewayDeviceId: deviceId,
          model: info.modelName,
          macAddress: info.MACAddr,
          gateway: this.gatewayAddress,
        },
      };
    } catch (err: unknown) {
      const classified = classifySupremaError(err);
      this.getConnectionManager().invalidate(device.id);
      this.logger?.warn(
        { deviceId: device.id, host, category: classified.category, error: classified.message },
        'Suprema G-SDK connection test failed',
      );
      let message = classified.message;
      if (/UNAVAILABLE|ECONNREFUSED|ETIMEDOUT|No connection established/i.test(message)) {
        message +=
          ' — ensure the Suprema Device Gateway is running and reachable at ' +
          `${this.gatewayAddress} (set SUPREMA_GATEWAY_ADDR / SUPREMA_GATEWAY_CA_CERT).`;
      }
      return { success: false, error: message, latencyMs: Date.now() - start };
    }
  }

  public async fetchLogs(
    device: DeviceModel,
    cursor?: SyncCursor,
    signal?: AbortSignal,
  ): Promise<FetchLogsResult> {
    const host = device.host ?? '127.0.0.1';

    if (signal?.aborted) {
      throw new Error('Fetch logs operation aborted');
    }

    if (this.isMockHost(host)) {
      return this.simulatedBatch(device, cursor);
    }

    try {
      const manager = this.getConnectionManager();
      const deviceId = await manager.ensureConnected(device);
      const startEventId = cursor?.lastLogIndex ?? 0;

      const logs = await this.getClient().getLog(deviceId, startEventId, FETCH_LIMIT);
      const catalog = this.getCatalog();

      const events: RawAttendanceEvent[] = logs
        .filter((log) => isPunchEvent(log.eventCode) && !!log.userID)
        .map((log) => mapGsdkEventToRawAttendance(device, log, catalog, EventSource.PULL));

      // Advance the cursor by the last RAW log id so non-punch ids are not re-scanned.
      const maxRawId = logs.reduce((max, log) => (log.ID > max ? log.ID : max), startEventId);
      const lastRecord = events[events.length - 1];

      return {
        events,
        nextCursor: {
          lastLogTimestamp:
            lastRecord?.deviceTime ?? cursor?.lastLogTimestamp ?? new Date().toISOString(),
          lastLogIndex: logs.length > 0 ? maxRawId + 1 : startEventId,
        },
        hasMore: logs.length === FETCH_LIMIT,
        checkpoint: lastRecord?.deviceTime,
      };
    } catch (err: unknown) {
      this.getConnectionManager().invalidate(device.id);
      const classified = classifySupremaError(err);
      throw new Error(
        `Suprema G-SDK fetchLogs failed (${classified.category}): ${classified.message}`,
      );
    }
  }

  private simulatedBatch(device: DeviceModel, cursor?: SyncCursor): FetchLogsResult {
    const simulator = this.buildSimulator(device);
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

  public async getStatus(device: DeviceModel, signal?: AbortSignal): Promise<DeviceStatus> {
    const result = await this.testConnection(device, signal);
    return result.success ? DeviceStatus.ONLINE : DeviceStatus.OFFLINE;
  }

  public async getDeviceInfo(
    device: DeviceModel,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const result = await this.testConnection(device, signal);
    return (result.details as Record<string, unknown>) ?? {};
  }

  public async getClock(device: DeviceModel, signal?: AbortSignal): Promise<DeviceClock> {
    const host = device.host ?? '127.0.0.1';

    if (signal?.aborted) {
      throw new Error('Get clock operation aborted');
    }

    if (this.isMockHost(host)) {
      const now = new Date();
      return { deviceTime: now, serverTime: now, driftSeconds: 0, synchronized: true };
    }

    const manager = this.getConnectionManager();
    const deviceId = await manager.ensureConnected(device);
    const gmtSeconds = await this.getClient().getTime(deviceId);
    const deviceTime = new Date(gmtSeconds * 1000);
    const serverTime = new Date();
    const driftSeconds = Math.abs(Math.round((serverTime.getTime() - deviceTime.getTime()) / 1000));
    return { deviceTime, serverTime, driftSeconds, synchronized: driftSeconds < 60 };
  }

  public async setClock(device: DeviceModel, timestamp: Date, signal?: AbortSignal): Promise<void> {
    const host = device.host ?? '127.0.0.1';

    if (signal?.aborted) {
      throw new Error('Set clock operation aborted');
    }
    if (this.isMockHost(host)) {
      return;
    }

    const manager = this.getConnectionManager();
    const deviceId = await manager.ensureConnected(device);
    await this.getClient().setTime(deviceId, Math.floor(timestamp.getTime() / 1000));
  }

  /**
   * Subscribes to the real-time log stream (RealtimeAttendanceAdapter contract).
   * Returns an unsubscribe function.
   */
  public async subscribe(
    device: DeviceModel,
    handler: (event: RawAttendanceEvent) => Promise<void>,
    signal?: AbortSignal,
    onStatus?: (connected: boolean) => void,
  ): Promise<() => void> {
    const manager = this.getConnectionManager();
    const deviceId = await manager.ensureConnected(device);
    const consumer = new GsdkRealtimeConsumer(
      this.getClient(),
      deviceId,
      this.getCatalog(),
      this.logger,
      undefined,
      (connected) => {
        // On a disconnect, forget the cached session so the next ensureConnected
        // performs a fresh re-dial — the gateway does not auto-reconnect a direct
        // connection, so this is what lets the terminal come back ONLINE.
        if (!connected) manager.invalidate(device.id);
        onStatus?.(connected);
      },
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

  /** Starts real-time streaming (parity helper with other adapters). */
  public async startRealtime(
    device: DeviceModel,
    onEvent: (event: RawAttendanceEvent) => Promise<void> | void,
  ): Promise<void> {
    await this.subscribe(device, async (event) => {
      await onEvent(event);
    });
  }

  /** Stops real-time streaming for a device. */
  public async stopRealtime(device: DeviceModel): Promise<void> {
    const consumer = this.realtimeConsumers.get(device.id);
    if (consumer) {
      consumer.stop();
      this.realtimeConsumers.delete(device.id);
    }
  }

  /** Releases gRPC resources. Call on shutdown. */
  public close(): void {
    for (const consumer of this.realtimeConsumers.values()) {
      consumer.stop();
    }
    this.realtimeConsumers.clear();
    if (this.client) {
      this.client.close();
      this.client = null;
      this.connectionManager = null;
    }
  }
}
