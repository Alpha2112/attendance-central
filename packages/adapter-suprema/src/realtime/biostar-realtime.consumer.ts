import { WebSocket } from 'ws';
import { type RawAttendanceEvent, type DeviceModel, EventSource } from '@attendance/contracts';
import { type BioStarEventLog, type BioStarConnectionOptions } from '../types/biostar.types.js';
import { BioStarClient } from '../client/biostar-client.js';
import { mapBioStarEventToRawAttendance } from '../events/event-mapper.js';
import { type AppLogger } from '@attendance/logging';

export type BioStarEventCallback = (event: RawAttendanceEvent) => Promise<void> | void;

export class BioStarRealtimeConsumer {
  private ws: WebSocket | null = null;
  private isRunning = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private lastReceivedTimestamp: string | null = null;

  constructor(
    private readonly client: BioStarClient,
    private readonly options: BioStarConnectionOptions,
    private readonly logger?: AppLogger,
  ) {}

  /**
   * Starts WebSocket event streaming for a given device with auto-reconnection and reconciliation.
   */
  public async start(device: DeviceModel, onEvent: BioStarEventCallback): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const connect = async () => {
      if (!this.isRunning) return;

      try {
        const sessionId = await this.client.login();
        const protocol = this.options.useHttps ? 'wss' : 'ws';
        const defaultPort = this.options.useHttps ? 443 : 80;
        const port = this.options.port ?? defaultPort;
        const wsUrl = `${protocol}://${this.options.host}:${port}/api/v2/monitoring/events`;

        this.logger?.info(
          { wsUrl, deviceId: device.id },
          'Connecting to BioStar 2 WebSocket stream',
        );

        this.ws = new WebSocket(wsUrl, {
          headers: {
            'bs-session-id': sessionId,
          },
          rejectUnauthorized: this.options.rejectUnauthorized ?? false,
        });

        this.ws.on('open', async () => {
          this.logger?.info('BioStar 2 WebSocket stream connected successfully');
          const previousDisconnect = this.reconnectAttempts > 0;
          this.reconnectAttempts = 0;

          // Reconcile missed events upon reconnect
          if (previousDisconnect && this.lastReceivedTimestamp) {
            await this.reconcileMissedEvents(device, onEvent);
          }
        });

        this.ws.on('message', async (data: Buffer | string) => {
          try {
            const rawStr = data.toString();
            const logEntry = JSON.parse(rawStr) as BioStarEventLog;

            if (logEntry && logEntry.datetime) {
              this.lastReceivedTimestamp = logEntry.datetime;
              const rawEvent = mapBioStarEventToRawAttendance(
                device,
                logEntry,
                EventSource.REALTIME,
              );
              await onEvent(rawEvent);
            }
          } catch (err: unknown) {
            this.logger?.warn(
              { error: err instanceof Error ? err.message : String(err) },
              'Failed to parse BioStar 2 WebSocket message',
            );
          }
        });

        this.ws.on('error', (err: Error) => {
          this.logger?.warn({ error: err.message }, 'BioStar 2 WebSocket error');
        });

        this.ws.on('close', (code: number, reason: string) => {
          this.logger?.warn({ code, reason: reason.toString() }, 'BioStar 2 WebSocket closed');
          this.scheduleReconnect(device, onEvent);
        });
      } catch (err: unknown) {
        this.logger?.warn(
          { error: err instanceof Error ? err.message : String(err) },
          'Failed to establish BioStar 2 WebSocket connection',
        );
        this.scheduleReconnect(device, onEvent);
      }
    };

    await connect();
  }

  /**
   * Reconciles missed events since last disconnect timestamp.
   */
  private async reconcileMissedEvents(
    device: DeviceModel,
    onEvent: BioStarEventCallback,
  ): Promise<void> {
    try {
      this.logger?.info(
        { since: this.lastReceivedTimestamp },
        'Reconciling BioStar 2 events missed during disconnection',
      );

      const searchRes = await this.client.searchEvents({
        startTime: this.lastReceivedTimestamp || undefined,
        limit: 100,
      });

      const missed = searchRes.EventCollection?.rows ?? [];
      this.logger?.info(
        { count: missed.length },
        'BioStar 2 historical reconciliation records retrieved',
      );

      for (const log of missed) {
        const rawEvent = mapBioStarEventToRawAttendance(device, log, EventSource.RECONCILIATION);
        await onEvent(rawEvent);
      }
    } catch (err: unknown) {
      this.logger?.error(
        { error: err instanceof Error ? err.message : String(err) },
        'BioStar 2 reconciliation failed',
      );
    }
  }

  private scheduleReconnect(device: DeviceModel, onEvent: BioStarEventCallback): void {
    if (!this.isRunning) return;

    this.reconnectAttempts++;
    // Exponential backoff with jitter (max 30s)
    const delay = Math.min(
      1000 * Math.pow(1.5, this.reconnectAttempts) + Math.random() * 500,
      30000,
    );

    this.logger?.info(
      { attempt: this.reconnectAttempts, delayMs: Math.round(delay) },
      'Scheduling BioStar 2 WebSocket reconnection',
    );

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.start(device, onEvent).catch(() => {});
    }, delay);
  }

  /**
   * Stops real-time event streaming.
   */
  public stop(): void {
    this.isRunning = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
