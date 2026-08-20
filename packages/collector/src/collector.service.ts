import { type DeviceModel } from '@attendance/contracts';
import { DeviceAdapterRegistry } from './registry/adapter-registry.js';
import { DeviceLockCoordinator } from './orchestration/device-lock.coordinator.js';
import { BackoffManager } from './orchestration/backoff-manager.js';
import { RawEventPublisher } from './publisher/raw-event.publisher.js';
import { DeviceHeartbeatMonitor } from './heartbeat/heartbeat-monitor.js';
import { DevicePollingOrchestrator } from './orchestration/polling-orchestrator.js';
import { type RedisLockManager } from '@attendance/redis';
import { type KafkaProducer } from '@attendance/kafka';
import { type AppLogger } from '@attendance/logging';

export interface CollectorConfig {
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
  lockTtlSeconds?: number;
}

const DEFAULT_CONFIG: CollectorConfig = {
  pollIntervalMs: 30000, // 30s
  heartbeatIntervalMs: 60000, // 60s
  lockTtlSeconds: 60,
};

/**
 * Enterprise Ingestion Service & Hardware Control Plane.
 * Manages device connections, scheduled polling loops, distributed locks, and Kafka ingestion.
 */
export class CollectorService {
  public readonly adapterRegistry: DeviceAdapterRegistry;
  public readonly lockCoordinator: DeviceLockCoordinator;
  public readonly backoffManager: BackoffManager;
  public readonly rawPublisher: RawEventPublisher;
  public readonly heartbeatMonitor: DeviceHeartbeatMonitor;
  public readonly pollingOrchestrator: DevicePollingOrchestrator;

  private pollTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private registeredDevices: DeviceModel[] = [];

  constructor(
    redisLockManager: RedisLockManager,
    kafkaProducer: KafkaProducer,
    private readonly logger?: AppLogger,
    private readonly config: CollectorConfig = DEFAULT_CONFIG,
  ) {
    this.adapterRegistry = new DeviceAdapterRegistry(logger);
    this.lockCoordinator = new DeviceLockCoordinator(redisLockManager, logger, {
      ttlSeconds: config.lockTtlSeconds,
    });
    this.backoffManager = new BackoffManager(logger);
    this.rawPublisher = new RawEventPublisher(kafkaProducer, logger);
    this.heartbeatMonitor = new DeviceHeartbeatMonitor(this.adapterRegistry, kafkaProducer, logger);
    this.pollingOrchestrator = new DevicePollingOrchestrator(
      this.adapterRegistry,
      this.lockCoordinator,
      this.backoffManager,
      this.rawPublisher,
      logger,
    );
  }

  /**
   * Sets the active device fleet to orchestrate.
   */
  public setDevices(devices: DeviceModel[]): void {
    this.registeredDevices = [...devices];
    this.logger?.info({ count: devices.length }, 'Collector active device fleet configured');
  }

  /**
   * Starts background polling and heartbeat monitoring loops.
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.logger?.info(
      {
        pollIntervalMs: this.config.pollIntervalMs,
        heartbeatIntervalMs: this.config.heartbeatIntervalMs,
        fleetSize: this.registeredDevices.length,
      },
      'Starting Collector Ingestion Service',
    );

    // Initial run
    void this.pollCycle();
    void this.heartbeatCycle();

    // Schedule intervals
    this.pollTimer = setInterval(() => void this.pollCycle(), this.config.pollIntervalMs);
    this.heartbeatTimer = setInterval(
      () => void this.heartbeatCycle(),
      this.config.heartbeatIntervalMs,
    );
  }

  /**
   * Single polling cycle across active fleet.
   */
  public async pollCycle(): Promise<void> {
    if (!this.isRunning || this.registeredDevices.length === 0) return;
    this.logger?.debug('Executing scheduled device polling cycle');
    await this.pollingOrchestrator.syncAll(this.registeredDevices);
  }

  /**
   * Single heartbeat probe cycle across active fleet.
   */
  public async heartbeatCycle(): Promise<void> {
    if (!this.isRunning || this.registeredDevices.length === 0) return;
    this.logger?.debug('Executing scheduled device heartbeat cycle');
    await this.heartbeatMonitor.probeAll(this.registeredDevices);
  }

  /**
   * Graceful shutdown stopping all timers and ensuring in-flight operations complete.
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.logger?.info('Stopping Collector Ingestion Service gracefully...');
    this.isRunning = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.logger?.info('Collector Ingestion Service stopped cleanly');
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }
}
