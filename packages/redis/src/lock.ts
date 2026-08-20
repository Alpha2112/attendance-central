import { RedisClient } from './client.js';

const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export interface LockResult {
  acquired: boolean;
  token?: string;
  key?: string;
}

export class RedisLockManager {
  constructor(private readonly redisClient: RedisClient) {}

  public async acquireLock(
    resource: string,
    ttlMs: number = 10000,
    customToken?: string,
  ): Promise<LockResult> {
    const client = this.redisClient.getClient();
    const token = customToken || `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    const lockKey = `locks:${resource}`;

    try {
      const result = await client.set(lockKey, token, 'PX', ttlMs, 'NX');
      if (result === 'OK') {
        return { acquired: true, token, key: lockKey };
      }
      return { acquired: false };
    } catch {
      return { acquired: false };
    }
  }

  public async releaseLock(resource: string, token: string): Promise<boolean> {
    const client = this.redisClient.getClient();
    const lockKey = `locks:${resource}`;

    try {
      const result = await client.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, token);
      return result === 1;
    } catch {
      return false;
    }
  }
}
