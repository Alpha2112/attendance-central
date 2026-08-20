import { Module, Global, OnApplicationShutdown, Inject } from '@nestjs/common';
import { RedisClient, RedisLockManager, RedisHealthIndicator } from '@attendance/redis';
import { CONFIG_TOKEN } from '../config/config.module.js';
import { LOGGER_TOKEN } from '../logging/logging.module.js';
import { type AppConfig } from '@attendance/config';
import { type AppLogger } from '@attendance/logging';

@Global()
@Module({
  providers: [
    {
      provide: RedisClient,
      inject: [CONFIG_TOKEN, LOGGER_TOKEN],
      useFactory: (config: AppConfig, logger: AppLogger): RedisClient => {
        return new RedisClient({ config, logger });
      },
    },
    {
      provide: RedisLockManager,
      inject: [RedisClient],
      useFactory: (client: RedisClient): RedisLockManager => {
        return new RedisLockManager(client);
      },
    },
    {
      provide: RedisHealthIndicator,
      inject: [RedisClient],
      useFactory: (client: RedisClient): RedisHealthIndicator => {
        return new RedisHealthIndicator(client);
      },
    },
  ],
  exports: [RedisClient, RedisLockManager, RedisHealthIndicator],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(RedisClient) private readonly client: RedisClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.disconnect();
  }
}
