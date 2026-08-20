import { DatabaseClient } from './pool.js';

export interface DatabaseHealthResult {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

export class DatabaseHealthIndicator {
  constructor(private readonly client: DatabaseClient) {}

  public async checkHealth(): Promise<DatabaseHealthResult> {
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
        error: 'Database ping returned false',
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;
      const errorMessage = err instanceof Error ? err.message : 'Unknown database health error';
      return {
        status: 'down',
        latencyMs,
        error: errorMessage,
      };
    }
  }
}
