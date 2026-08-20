import { type KafkaProducer } from '@attendance/kafka';
import {
  type DeviceModel,
  type DeviceStatusEvent,
  DeviceStatus,
  KAFKA_TOPICS,
  buildKafkaDeviceKey,
} from '@attendance/contracts';
import { type DeviceAdapterRegistry } from '../registry/adapter-registry.js';
import { type AppLogger } from '@attendance/logging';
import { randomUUID } from 'node:crypto';

export interface HeartbeatProbeResult {
  deviceId: string;
  status: DeviceStatus;
  latencyMs?: number;
  error?: string;
  timestamp: string;
}

/**
 * Periodically queries device reachability, records heartbeats,
 * and publishes status transition events to Kafka.
 */
export class DeviceHeartbeatMonitor {
  constructor(
    private readonly adapterRegistry: DeviceAdapterRegistry,
    private readonly kafkaProducer: KafkaProducer,
    private readonly logger?: AppLogger,
  ) {}

  /**
   * Probes a single device and emits a DeviceStatusEvent to Kafka.
   */
  public async probeDevice(device: DeviceModel): Promise<HeartbeatProbeResult> {
    const start = Date.now();
    let currentStatus = DeviceStatus.OFFLINE;
    let errorMessage: string | undefined;
    let latencyMs: number | undefined;

    try {
      const adapter = this.adapterRegistry.resolve(device);
      const testResult = await adapter.testConnection(device);

      latencyMs = testResult.latencyMs ?? Date.now() - start;

      if (testResult.success) {
        currentStatus = DeviceStatus.ONLINE;
      } else {
        currentStatus = DeviceStatus.DEGRADED;
        errorMessage = testResult.error ?? 'Connection test failed';
      }
    } catch (err: unknown) {
      latencyMs = Date.now() - start;
      currentStatus = DeviceStatus.OFFLINE;
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    const timestamp = new Date().toISOString();

    // Construct canonical DeviceStatusEvent adhering to DeviceStatusEventSchema
    const statusEvent: DeviceStatusEvent = {
      eventId: randomUUID(),
      schemaVersion: 1,
      tenantId: device.tenantId ?? undefined,
      organizationId: device.organizationId,
      deviceId: device.id,
      status: currentStatus,
      latencyMs: latencyMs ? Math.round(latencyMs) : undefined,
      errorMessage,
      observedAt: timestamp,
      metadata: {
        deviceCode: device.deviceCode,
        vendor: device.vendor,
      },
    };

    // Publish to Kafka: (organizationId, deviceId, tenantId)
    const partitionKey = buildKafkaDeviceKey(
      device.organizationId,
      device.id,
      device.tenantId ?? undefined,
    );

    try {
      await this.kafkaProducer.publish({
        topic: KAFKA_TOPICS.DEVICE_STATUS,
        key: partitionKey,
        value: statusEvent,
      });
    } catch (publishErr: unknown) {
      this.logger?.error(
        {
          deviceId: device.id,
          error: publishErr instanceof Error ? publishErr.message : String(publishErr),
        },
        'Failed to publish DeviceStatusEvent to Kafka',
      );
    }

    this.logger?.debug(
      { deviceId: device.id, status: currentStatus, latencyMs, error: errorMessage },
      'Device heartbeat probe completed',
    );

    return {
      deviceId: device.id,
      status: currentStatus,
      latencyMs,
      error: errorMessage,
      timestamp,
    };
  }

  /**
   * Probes all devices in a batch.
   */
  public async probeAll(devices: DeviceModel[]): Promise<HeartbeatProbeResult[]> {
    const results = await Promise.all(devices.map((device) => this.probeDevice(device)));
    return results;
  }
}
