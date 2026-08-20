import { Module, Global, OnApplicationShutdown, Inject } from '@nestjs/common';
import { DatabaseClient, DatabaseHealthIndicator } from '@attendance/database';
import { CONFIG_TOKEN } from '../config/config.module.js';
import { LOGGER_TOKEN } from '../logging/logging.module.js';
import { type AppConfig } from '@attendance/config';
import { type AppLogger } from '@attendance/logging';

@Global()
@Module({
  providers: [
    {
      provide: DatabaseClient,
      inject: [CONFIG_TOKEN, LOGGER_TOKEN],
      useFactory: (config: AppConfig, logger: AppLogger): DatabaseClient => {
        return new DatabaseClient({ config, logger });
      },
    },
    {
      provide: DatabaseHealthIndicator,
      inject: [DatabaseClient],
      useFactory: (client: DatabaseClient): DatabaseHealthIndicator => {
        return new DatabaseHealthIndicator(client);
      },
    },
  ],
  exports: [DatabaseClient, DatabaseHealthIndicator],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DatabaseClient) private readonly client: DatabaseClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.close();
  }
}
