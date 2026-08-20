import { describe, it, expect, vi } from 'vitest';
import { RedisClient, RedisHealthIndicator, RedisLockManager } from '../index.js';

describe('Redis Package', () => {
  const dummyConfig = {
    REDIS_HOST: '127.0.0.1',
    REDIS_PORT: 6379,
    REDIS_PASSWORD: 'test_password',
    REDIS_DB: 0,
    REDIS_KEY_PREFIX: 'test:',
    REDIS_CONNECT_TIMEOUT_MS: 1000,
  };

  it('should initialize RedisClient, HealthIndicator and LockManager', () => {
    const client = new RedisClient({ config: dummyConfig });
    expect(client).toBeDefined();

    const health = new RedisHealthIndicator(client);
    expect(health).toBeDefined();

    const lockManager = new RedisLockManager(client);
    expect(lockManager).toBeDefined();
  });

  it('should report healthy when ping succeeds', async () => {
    const client = new RedisClient({ config: dummyConfig });
    vi.spyOn(client, 'ping').mockResolvedValue(true);

    const health = new RedisHealthIndicator(client);
    const result = await health.checkHealth();

    expect(result.status).toBe('up');
    expect(result.latencyMs).toBeTypeOf('number');
  });

  it('should report unhealthy when ping fails', async () => {
    const client = new RedisClient({ config: dummyConfig });
    vi.spyOn(client, 'ping').mockResolvedValue(false);

    const health = new RedisHealthIndicator(client);
    const result = await health.checkHealth();

    expect(result.status).toBe('down');
    expect(result.error).toBeDefined();
  });
});
