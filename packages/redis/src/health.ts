import { RedisClient } from './client.js';

export interface RedisHealthResult {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

export class RedisHealthIndicator {
  constructor(private readonly client: RedisClient) {}

  public async checkHealth(): Promise<RedisHealthResult> {
    const start = Date.now();
    try {
      const isAlive = await this.client.ping();
      const latencyMs = Date.now() - start;

      if (isAlive) {
        return {
          status: 'up',
          latencyMs,
        };
      }

      return {
        status: 'down',
        latencyMs,
        error: 'Redis ping failed',
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;
      const errorMessage = err instanceof Error ? err.message : 'Unknown Redis health error';
      return {
        status: 'down',
        latencyMs,
        error: errorMessage,
      };
    }
  }
}
