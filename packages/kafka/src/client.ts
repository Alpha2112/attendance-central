import { Kafka, type KafkaConfig as KafkaJsConfig, logLevel } from 'kafkajs';
import { type KafkaConfig } from '@attendance/config';
import { type AppLogger } from '@attendance/logging';

export interface KafkaClientOptions {
  config: KafkaConfig;
  logger?: AppLogger;
}

export class KafkaClient {
  private kafka: Kafka | null = null;
  private readonly config: KafkaConfig;
  private readonly logger?: AppLogger;

  constructor(options: KafkaClientOptions) {
    this.config = options.config;
    this.logger = options.logger;
  }

  public getKafka(): Kafka {
    if (!this.kafka) {
      const kafkaConfig: KafkaJsConfig = {
        clientId: this.config.KAFKA_CLIENT_ID,
        brokers: this.config.KAFKA_BROKERS,
        connectionTimeout: this.config.KAFKA_CONNECTION_TIMEOUT_MS,
        requestTimeout: this.config.KAFKA_REQUEST_TIMEOUT_MS,
        retry: {
          initialRetryTime: 300,
          retries: 8,
          maxRetryTime: 30000,
          factor: 0.2,
          multiplier: 2,
        },
        logLevel: logLevel.NOTHING, // Internal logs routed through custom wrappers
      };

      this.kafka = new Kafka(kafkaConfig);
      this.logger?.info(
        {
          clientId: this.config.KAFKA_CLIENT_ID,
          brokers: this.config.KAFKA_BROKERS,
        },
        'Kafka client initialized',
      );
    }
    return this.kafka;
  }
}
