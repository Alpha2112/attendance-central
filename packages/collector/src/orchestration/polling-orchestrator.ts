import { type DeviceModel, type SyncCursor } from '@attendance/contracts';
import { type DeviceAdapterRegistry } from '../registry/adapter-registry.js';
import { type DeviceLockCoordinator } from './device-lock.coordinator.js';
import { type BackoffManager } from './backoff-manager.js';
import { type RawEventPublisher } from '../publisher/raw-event.publisher.js';
import { type AppLogger } from '@attendance/logging';

export interface DeviceSyncResult {
  deviceId: string;
  success: boolean;
  eventsCount: number;
  nextCursor?: SyncCursor;
  error?: string;
  skippedDueToBackoff?: boolean;
}

export interface PollingOrchestratorOptions {
  cursorStorage?: Map<string, SyncCursor>;
}

/**
 * Orchestrates periodic and on-demand log synchronization across biometric devices
 * with Redis distributed locking, adaptive backoff, and incremental cursor management.
 */
export class DevicePollingOrchestrator {
  private readonly cursors: Map<string, SyncCursor>;

  constructor(
    private readonly adapterRegistry: DeviceAdapterRegistry,
    private readonly lockCoordinator: DeviceLockCoordinator,
    private readonly backoffManager: BackoffManager,
    private readonly rawPublisher: RawEventPublisher,
    private readonly logger?: AppLogger,
    options?: PollingOrchestratorOptions,
  ) {
    this.cursors = options?.cursorStorage ?? new Map<string, SyncCursor>();
  }

  /**
   * Synchronizes logs for a single device with distributed locking and backoff checking.
   */
  public async syncDevice(device: DeviceModel): Promise<DeviceSyncResult> {
    const deviceId = device.id;

    // 1. Check if device is in backoff window
    if (!this.backoffManager.isAllowed(deviceId)) {
      const state = this.backoffManager.getState(deviceId);
      this.logger?.debug(
        { deviceId, nextAttemptAt: state?.nextAllowedAttempt.toISOString() },
        'Skipping device poll: Currently in adaptive backoff window',
      );
      return {
        deviceId,
        success: false,
        eventsCount: 0,
        skippedDueToBackoff: true,
        error: `Device in backoff until ${state?.nextAllowedAttempt.toISOString()}`,
      };
    }

    // 2. Execute sync within Redis per-device distributed lock
    try {
      return await this.lockCoordinator.withDeviceLock(deviceId, async () => {
        const adapter = this.adapterRegistry.resolve(device);
        const currentCursor = this.cursors.get(deviceId);

        this.logger?.info(
          { deviceId, vendor: device.vendor, cursor: currentCursor },
          'Starting device incremental log pull',
        );

        // 3. Pull incremental logs from adapter
        const result = await adapter.fetchLogs(device, currentCursor);

        // 4. Publish raw events to Kafka attendance.raw.v1
        if (result.events.length > 0) {
          await this.rawPublisher.publishRawBatch(result.events);
        }

        // 5. Advance cursor checkpoint
        if (result.nextCursor) {
          this.cursors.set(deviceId, result.nextCursor);
        }

        // 6. Clear backoff failure count on success
        this.backoffManager.recordSuccess(deviceId);

        this.logger?.info(
          {
            deviceId,
            eventsIngested: result.events.length,
            nextCursor: result.nextCursor,
            hasMore: result.hasMore,
          },
          'Device log synchronization completed successfully',
        );

        return {
          deviceId,
          success: true,
          eventsCount: result.events.length,
          nextCursor: result.nextCursor,
        };
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.backoffManager.recordFailure(deviceId, errorMessage);

      this.logger?.error({ deviceId, error: errorMessage }, 'Device log synchronization failed');

      return {
        deviceId,
        success: false,
        eventsCount: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Synchronizes multiple devices sequentially or concurrently without blocking across failures.
   */
  public async syncAll(devices: DeviceModel[]): Promise<DeviceSyncResult[]> {
    const results: DeviceSyncResult[] = [];
    for (const device of devices) {
      const res = await this.syncDevice(device);
      results.push(res);
    }
    return results;
  }

  /**
   * Retrieves current cursor for a device.
   */
  public getCursor(deviceId: string): SyncCursor | undefined {
    return this.cursors.get(deviceId);
  }

  /**
   * Sets or updates cursor for a device.
   */
  public setCursor(deviceId: string, cursor: SyncCursor): void {
    this.cursors.set(deviceId, cursor);
  }
}
