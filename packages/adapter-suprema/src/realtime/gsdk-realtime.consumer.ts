import { type RawAttendanceEvent, type DeviceModel, EventSource } from '@attendance/contracts';
import { type AppLogger } from '@attendance/logging';
import {
  type GatewayClient,
  type GsdkEventLog,
  type GsdkStatusChange,
  type RealtimeLogStream,
  type StatusChangeStream,
  GsdkConnectionStatus,
} from '../types/gsdk.types.js';
import { mapGsdkEventToRawAttendance } from '../events/event-mapper.js';
import { EventCodeCatalog, isPunchEvent } from '../events/event-codes.js';

export type GsdkEventCallback = (event: RawAttendanceEvent) => Promise<void> | void;

const DEFAULT_QUEUE_SIZE = 1024;
const MAX_RECONNECT_DELAY_MS = 30_000;
const RECONCILE_BATCH = 128;
const STATUS_RETRY_DELAY_MS = 5_000;

/**
 * Subscribes to the gateway's real-time log stream for a single device, with
 * bounded exponential-backoff reconnection and historical reconciliation of any
 * events recorded while the stream was down.
 */
export class GsdkRealtimeConsumer {
  private stream: RealtimeLogStream | null = null;
  private isRunning = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private lastEventId = 0;
  private hadPreviousConnection = false;

  // Device status watch: re-enables monitoring + reconciles when the terminal
  // reconnects to the gateway (e.g. after a Wi-Fi keep-alive drop), so live
  // delivery survives network flaps without a gap.
  private statusStream: StatusChangeStream | null = null;
  private statusRetryTimer: NodeJS.Timeout | null = null;
  private deviceConnected = true;
  private device: DeviceModel | null = null;
  private onEvent: GsdkEventCallback | null = null;

  constructor(
    private readonly client: GatewayClient,
    private readonly deviceId: number,
    private readonly catalog: EventCodeCatalog,
    private readonly logger?: AppLogger,
    private readonly queueSize: number = DEFAULT_QUEUE_SIZE,
  ) {}

  public async start(device: DeviceModel, onEvent: GsdkEventCallback): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.device = device;
    this.onEvent = onEvent;
    await this.connect(device, onEvent);
    this.startStatusWatch();
  }

  /** Watches device connection status to re-arm monitoring after a reconnect. */
  private startStatusWatch(): void {
    if (!this.isRunning) return;
    try {
      const stream = this.client.subscribeStatus(this.queueSize);
      this.statusStream = stream;
      stream.on('data', (change: GsdkStatusChange) => {
        void this.handleStatusChange(change);
      });
      stream.on('error', () => this.scheduleStatusRetry());
      stream.on('end', () => this.scheduleStatusRetry());
    } catch {
      this.scheduleStatusRetry();
    }
  }

  private async handleStatusChange(change: GsdkStatusChange): Promise<void> {
    if (change.deviceID !== this.deviceId) return;

    const connected =
      change.status === GsdkConnectionStatus.TCP_CONNECTED ||
      change.status === GsdkConnectionStatus.TLS_CONNECTED;
    const wasConnected = this.deviceConnected;
    this.deviceConnected = connected;

    // Only act on a down -> up transition (a fresh reconnect).
    if (!connected || wasConnected || !this.device || !this.onEvent) return;

    this.logger?.info(
      { deviceId: this.device.id, gatewayDeviceId: this.deviceId },
      'Suprema terminal reconnected; re-enabling monitoring and reconciling missed events',
    );
    try {
      await this.client.enableMonitoring(this.deviceId);
      await this.reconcile(this.device, this.onEvent);
    } catch (err: unknown) {
      this.logger?.warn(
        { deviceId: this.device.id, error: err instanceof Error ? err.message : String(err) },
        'Failed to re-arm monitoring after Suprema terminal reconnect',
      );
    }
  }

  private scheduleStatusRetry(): void {
    if (!this.isRunning) return;
    this.closeStatusStream();
    if (this.statusRetryTimer) clearTimeout(this.statusRetryTimer);
    this.statusRetryTimer = setTimeout(() => this.startStatusWatch(), STATUS_RETRY_DELAY_MS);
  }

  private closeStatusStream(): void {
    if (this.statusStream) {
      try {
        this.statusStream.cancel();
      } catch {
        // already closed
      }
      this.statusStream = null;
    }
  }

  private async connect(device: DeviceModel, onEvent: GsdkEventCallback): Promise<void> {
    if (!this.isRunning) return;

    try {
      await this.client.enableMonitoring(this.deviceId);

      if (this.hadPreviousConnection && this.lastEventId > 0) {
        await this.reconcile(device, onEvent);
      }

      const stream = this.client.subscribeRealtimeLog([this.deviceId], this.queueSize);
      this.stream = stream;
      this.reconnectAttempts = 0;
      this.hadPreviousConnection = true;

      this.logger?.info(
        { deviceId: device.id, gatewayDeviceId: this.deviceId },
        'Subscribed to Suprema G-SDK real-time log stream',
      );

      stream.on('data', (log: GsdkEventLog) => {
        void this.handleLog(device, log, onEvent);
      });
      stream.on('error', (err: Error) => {
        this.logger?.warn(
          { deviceId: device.id, error: err.message },
          'Suprema G-SDK real-time stream error',
        );
        this.scheduleReconnect(device, onEvent);
      });
      stream.on('end', () => {
        this.logger?.warn({ deviceId: device.id }, 'Suprema G-SDK real-time stream ended');
        this.scheduleReconnect(device, onEvent);
      });
    } catch (err: unknown) {
      this.logger?.warn(
        { deviceId: device.id, error: err instanceof Error ? err.message : String(err) },
        'Failed to start Suprema G-SDK real-time stream',
      );
      this.scheduleReconnect(device, onEvent);
    }
  }

  private async handleLog(
    device: DeviceModel,
    log: GsdkEventLog,
    onEvent: GsdkEventCallback,
  ): Promise<void> {
    try {
      if (log.ID > this.lastEventId) {
        this.lastEventId = log.ID;
      }
      if (!isPunchEvent(log.eventCode) || !log.userID) {
        return;
      }
      const event = mapGsdkEventToRawAttendance(device, log, this.catalog, EventSource.REALTIME);
      await onEvent(event);
    } catch (err: unknown) {
      this.logger?.warn(
        { deviceId: device.id, error: err instanceof Error ? err.message : String(err) },
        'Failed to process Suprema G-SDK real-time event',
      );
    }
  }

  /** Pulls events recorded while the stream was down, from lastEventId forward. */
  private async reconcile(device: DeviceModel, onEvent: GsdkEventCallback): Promise<void> {
    try {
      let startId = this.lastEventId + 1;
      for (;;) {
        const logs = await this.client.getLog(this.deviceId, startId, RECONCILE_BATCH);
        if (logs.length === 0) break;

        for (const log of logs) {
          if (log.ID > this.lastEventId) this.lastEventId = log.ID;
          if (isPunchEvent(log.eventCode) && log.userID) {
            const event = mapGsdkEventToRawAttendance(
              device,
              log,
              this.catalog,
              EventSource.RECONCILIATION,
            );
            await onEvent(event);
          }
        }

        if (logs.length < RECONCILE_BATCH) break;
        startId = this.lastEventId + 1;
      }
      this.logger?.info(
        { deviceId: device.id, upToEventId: this.lastEventId },
        'Suprema G-SDK reconciliation after reconnect completed',
      );
    } catch (err: unknown) {
      this.logger?.error(
        { deviceId: device.id, error: err instanceof Error ? err.message : String(err) },
        'Suprema G-SDK reconciliation failed',
      );
    }
  }

  private scheduleReconnect(device: DeviceModel, onEvent: GsdkEventCallback): void {
    if (!this.isRunning) return;
    this.closeStream();
    this.reconnectAttempts += 1;

    const delay = Math.min(
      1000 * Math.pow(1.5, this.reconnectAttempts) + Math.random() * 500,
      MAX_RECONNECT_DELAY_MS,
    );

    this.logger?.info(
      { deviceId: device.id, attempt: this.reconnectAttempts, delayMs: Math.round(delay) },
      'Scheduling Suprema G-SDK real-time reconnection',
    );

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      void this.connect(device, onEvent);
    }, delay);
  }

  private closeStream(): void {
    if (this.stream) {
      try {
        this.stream.cancel();
      } catch {
        // stream already closed
      }
      this.stream = null;
    }
  }

  public stop(): void {
    this.isRunning = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.statusRetryTimer) {
      clearTimeout(this.statusRetryTimer);
      this.statusRetryTimer = null;
    }
    this.closeStream();
    this.closeStatusStream();
    void Promise.resolve(this.client.disableMonitoring(this.deviceId)).catch(() => {
      /* best effort */
    });
  }
}
