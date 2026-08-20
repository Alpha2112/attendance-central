import { type Admin } from 'kafkajs';
import { KafkaClient } from './client.js';
import { type AppLogger } from '@attendance/logging';

export interface KafkaHealthResult {
  status: 'up' | 'down';
  latencyMs?: number;
  brokers?: number;
  clusterId?: string;
  error?: string;
}

export class KafkaHealthIndicator {
  private admin: Admin | null = null;
  private readonly logger?: AppLogger;

  constructor(
    private readonly client: KafkaClient,
    logger?: AppLogger,
  ) {
    this.logger = logger;
  }

  public async checkHealth(): Promise<KafkaHealthResult> {
    const start = Date.now();
    try {
      if (!this.admin) {
        this.admin = this.client.getKafka().admin();
        await this.admin.connect();
      }

      const clusterInfo = await this.admin.describeCluster();
      const latencyMs = Date.now() - start;

      return {
        status: 'up',
        latencyMs,
        brokers: clusterInfo.brokers.length,
        clusterId: clusterInfo.clusterId,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;
      const errorMessage = err instanceof Error ? err.message : 'Unknown Kafka health error';
      this.logger?.error({ error: err }, 'Kafka health check failed');

      if (this.admin) {
        try {
          await this.admin.disconnect();
        } catch {
          // ignore disconnect error
        }
        this.admin = null;
      }

      return {
        status: 'down',
        latencyMs,
        error: errorMessage,
      };
    }
  }

  public async disconnect(): Promise<void> {
    if (this.admin) {
      await this.admin.disconnect();
      this.admin = null;
    }
  }
}
