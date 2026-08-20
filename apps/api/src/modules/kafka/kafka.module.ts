import { Module, Global, OnApplicationShutdown, Inject } from '@nestjs/common';
import { KafkaClient, KafkaProducer, KafkaHealthIndicator } from '@attendance/kafka';
import { CONFIG_TOKEN } from '../config/config.module.js';
import { LOGGER_TOKEN } from '../logging/logging.module.js';
import { type AppConfig } from '@attendance/config';
import { type AppLogger } from '@attendance/logging';

@Global()
@Module({
  providers: [
    {
      provide: KafkaClient,
      inject: [CONFIG_TOKEN, LOGGER_TOKEN],
      useFactory: (config: AppConfig, logger: AppLogger): KafkaClient => {
        return new KafkaClient({ config, logger });
      },
    },
    {
      provide: KafkaProducer,
      inject: [KafkaClient, LOGGER_TOKEN],
      useFactory: (client: KafkaClient, logger: AppLogger): KafkaProducer => {
        return new KafkaProducer(client, logger);
      },
    },
    {
      provide: KafkaHealthIndicator,
      inject: [KafkaClient, LOGGER_TOKEN],
      useFactory: (client: KafkaClient, logger: AppLogger): KafkaHealthIndicator => {
        return new KafkaHealthIndicator(client, logger);
      },
    },
  ],
  exports: [KafkaClient, KafkaProducer, KafkaHealthIndicator],
})
export class KafkaModule implements OnApplicationShutdown {
  constructor(
    @Inject(KafkaProducer) private readonly producer: KafkaProducer,
    @Inject(KafkaHealthIndicator) private readonly healthIndicator: KafkaHealthIndicator,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.producer.disconnect();
    await this.healthIndicator.disconnect();
  }
}
