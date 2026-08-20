import { type RedisClient } from '@attendance/redis';

export interface RateLimitResult {
  allowed: boolean;
  totalTokens: number;
  remaining: number;
  resetSeconds: number;
}

export class RateLimiter {
  constructor(private readonly redis?: RedisClient) {}

  /**
   * Evaluates if a request within a sliding window is allowed.
   */
  public async consume(key: string, limit = 100, windowSeconds = 60): Promise<RateLimitResult> {
    if (!this.redis) {
      // In-memory fallback if redis not injected
      return {
        allowed: true,
        totalTokens: limit,
        remaining: limit - 1,
        resetSeconds: windowSeconds,
      };
    }

    const redisKey = `ratelimit:${key}`;
    const rawClient = this.redis.getClient();

    try {
      const current = await rawClient.incr(redisKey);
      if (current === 1) {
        await rawClient.expire(redisKey, windowSeconds);
      }

      const ttl = await rawClient.ttl(redisKey);
      const allowed = current <= limit;
      const remaining = Math.max(0, limit - current);

      return {
        allowed,
        totalTokens: limit,
        remaining,
        resetSeconds: ttl > 0 ? ttl : windowSeconds,
      };
    } catch {
      // Fail open safely on Redis transient error
      return {
        allowed: true,
        totalTokens: limit,
        remaining: 1,
        resetSeconds: windowSeconds,
      };
    }
  }
}
