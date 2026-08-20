import { describe, it, expect, vi } from 'vitest';
import { DatabaseClient, DatabaseHealthIndicator } from '../index.js';

describe('Database Package', () => {
  const dummyConfig = {
    DB_HOST: '127.0.0.1',
    DB_PORT: 3306,
    DB_USERNAME: 'test_user',
    DB_PASSWORD: 'test_pass',
    DB_DATABASE: 'test_db',
    DB_CONNECTION_LIMIT: 5,
    DB_CONNECT_TIMEOUT_MS: 1000,
  };

  it('should initialize DatabaseClient and DatabaseHealthIndicator', () => {
    const dbClient = new DatabaseClient({ config: dummyConfig });
    expect(dbClient).toBeDefined();

    const healthIndicator = new DatabaseHealthIndicator(dbClient);
    expect(healthIndicator).toBeDefined();
  });

  it('should handle failed ping gracefully in health indicator', async () => {
    const dbClient = new DatabaseClient({ config: dummyConfig });
    vi.spyOn(dbClient, 'ping').mockResolvedValue(false);

    const healthIndicator = new DatabaseHealthIndicator(dbClient);
    const result = await healthIndicator.checkHealth();

    expect(result.status).toBe('down');
    expect(result.error).toBeDefined();
  });

  it('should report healthy when ping succeeds', async () => {
    const dbClient = new DatabaseClient({ config: dummyConfig });
    vi.spyOn(dbClient, 'ping').mockResolvedValue(true);

    const healthIndicator = new DatabaseHealthIndicator(dbClient);
    const result = await healthIndicator.checkHealth();

    expect(result.status).toBe('up');
    expect(result.latencyMs).toBeTypeOf('number');
  });
});
