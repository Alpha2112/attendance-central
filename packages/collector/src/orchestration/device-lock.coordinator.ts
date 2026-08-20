import { type RedisLockManager, type LockResult } from '@attendance/redis';
import { type AppLogger } from '@attendance/logging';

export class DeviceLockAcquisitionError extends Error {
  constructor(deviceId: string) {
    super(
      `Could not acquire distributed sync lock for device '${deviceId}'. Sync already in progress.`,
    );
    this.name = 'DeviceLockAcquisitionError';
  }
}

export interface LockCoordinatorOptions {
  ttlSeconds?: number;
}

/**
 * Ensures mutual exclusion for operations targeting a specific hardware device
 * using Redis distributed locks.
 */
export class DeviceLockCoordinator {
  private readonly ttlSeconds: number;

  constructor(
    private readonly lockManager: RedisLockManager,
    private readonly logger?: AppLogger,
    options?: LockCoordinatorOptions,
  ) {
    this.ttlSeconds = options?.ttlSeconds ?? 60; // 60 seconds default sync lock TTL
  }

  /**
   * Executes a callback within a device-scoped distributed lock.
   */
  public async withDeviceLock<T>(deviceId: string, operation: () => Promise<T>): Promise<T> {
    const resourceKey = `device:${deviceId}`;
    const ttlMs = this.ttlSeconds * 1000;
    const lockResult: LockResult = await this.lockManager.acquireLock(resourceKey, ttlMs);

    if (!lockResult.acquired || !lockResult.token) {
      this.logger?.warn(
        { deviceId, resourceKey },
        'Concurrent sync attempt rejected: Device lock already held',
      );
      throw new DeviceLockAcquisitionError(deviceId);
    }

    try {
      this.logger?.debug({ deviceId, resourceKey }, 'Acquired device sync lock');
      return await operation();
    } finally {
      try {
        await this.lockManager.releaseLock(resourceKey, lockResult.token);
        this.logger?.debug({ deviceId, resourceKey }, 'Released device sync lock');
      } catch (err: unknown) {
        this.logger?.error(
          { deviceId, resourceKey, error: err instanceof Error ? err.message : String(err) },
          'Failed to gracefully release device sync lock',
        );
      }
    }
  }
}
