import { type AppLogger } from '@attendance/logging';

export interface BackoffConfig {
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitterFactor: number; // e.g. 0.2 for +/- 20%
}

export interface DeviceBackoffState {
  failureCount: number;
  nextAllowedAttempt: Date;
  lastFailureReason?: string;
}

const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  initialDelayMs: 2000, // 2s
  maxDelayMs: 300000, // 5 minutes
  multiplier: 2.0,
  jitterFactor: 0.2,
};

/**
 * Manages adaptive exponential backoff with full jitter per device to prevent
 * thundering herd problems when devices go offline.
 */
export class BackoffManager {
  private readonly states = new Map<string, DeviceBackoffState>();
  private readonly config: BackoffConfig;

  constructor(
    private readonly logger?: AppLogger,
    config?: Partial<BackoffConfig>,
  ) {
    this.config = { ...DEFAULT_BACKOFF_CONFIG, ...config };
  }

  /**
   * Checks whether a device is currently allowed to be polled.
   */
  public isAllowed(deviceId: string): boolean {
    const state = this.states.get(deviceId);
    if (!state) return true;
    return new Date() >= state.nextAllowedAttempt;
  }

  /**
   * Records a successful sync attempt and clears backoff state.
   */
  public recordSuccess(deviceId: string): void {
    if (this.states.has(deviceId)) {
      this.states.delete(deviceId);
      this.logger?.info({ deviceId }, 'Device backoff reset after successful operation');
    }
  }

  /**
   * Records a failed sync attempt and computes the next backoff window.
   */
  public recordFailure(deviceId: string, reason?: string): number {
    const current = this.states.get(deviceId) ?? {
      failureCount: 0,
      nextAllowedAttempt: new Date(),
    };
    const failureCount = current.failureCount + 1;

    // Exponential delay = initial * multiplier^(count-1)
    const baseDelay = Math.min(
      this.config.maxDelayMs,
      this.config.initialDelayMs * Math.pow(this.config.multiplier, failureCount - 1),
    );

    // Apply random jitter: delay * (1 + random(-jitter, +jitter))
    const jitterRange = this.config.jitterFactor;
    const jitter = 1 + (Math.random() * 2 * jitterRange - jitterRange);
    const delayWithJitter = Math.floor(baseDelay * jitter);

    const nextAllowedAttempt = new Date(Date.now() + delayWithJitter);
    this.states.set(deviceId, {
      failureCount,
      nextAllowedAttempt,
      lastFailureReason: reason,
    });

    this.logger?.warn(
      {
        deviceId,
        failureCount,
        delayWithJitterMs: delayWithJitter,
        nextAttemptAt: nextAllowedAttempt.toISOString(),
        reason,
      },
      'Device backoff window updated after failure',
    );

    return delayWithJitter;
  }

  /**
   * Retrieves the backoff state for a device.
   */
  public getState(deviceId: string): DeviceBackoffState | undefined {
    return this.states.get(deviceId);
  }
}
