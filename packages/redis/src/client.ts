import { Redis, type RedisOptions } from 'ioredis';
import { type RedisConfig } from '@attendance/config';
import { type AppLogger } from '@attendance/logging';

export interface RedisClientOptions {
  config: RedisConfig;
  logger?: AppLogger;
}

export class RedisClient {
  private client: Redis | null = null;
  private readonly config: RedisConfig;
  private readonly logger?: AppLogger;

  constructor(options: RedisClientOptions) {
    this.config = options.config;
    this.logger = options.logger;
  }

  public getClient(): Redis {
    if (!this.client) {
      const redisOptions: RedisOptions = {
        host: this.config.REDIS_HOST,
        port: this.config.REDIS_PORT,
        password: this.config.REDIS_PASSWORD || undefined,
        db: this.config.REDIS_DB,
        keyPrefix: this.config.REDIS_KEY_PREFIX,
        connectTimeout: this.config.REDIS_CONNECT_TIMEOUT_MS,
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          const delay = Math.min(times * 200, 3000);
          return delay;
        },
      };

      this.client = new Redis(redisOptions);

      this.client.on('error', (err) => {
        this.logger?.error({ error: err }, 'Redis connection error');
      });

      this.client.on('connect', () => {
        this.logger?.info('Redis connected successfully');
      });

      this.client.on('reconnecting', () => {
        this.logger?.warn('Redis reconnecting...');
      });
    }

    return this.client;
  }

  public async connect(): Promise<void> {
    const client = this.getClient();
    if (client.status === 'wait') {
      await client.connect();
    }
  }

  public async ping(): Promise<boolean> {
    try {
      const client = this.getClient();
      if (client.status === 'wait') {
        await client.connect();
      }
      const pong = await client.ping();
      return pong === 'PONG';
    } catch (error) {
      this.logger?.error({ error }, 'Redis ping failed');
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.logger?.info('Redis client disconnected');
    }
  }
}
