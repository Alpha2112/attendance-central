import { type Producer, type RecordMetadata } from 'kafkajs';
import { KafkaClient } from './client.js';
import { type AppLogger } from '@attendance/logging';
import { type KafkaTopic } from '@attendance/contracts';

export interface PublishMessageOptions<T> {
  topic: KafkaTopic | string;
  key: string;
  value: T;
  headers?: Record<string, string>;
}

export class KafkaProducer {
  private producer: Producer | null = null;
  private isConnected = false;
  private readonly logger?: AppLogger;

  constructor(
    private readonly client: KafkaClient,
    logger?: AppLogger,
  ) {
    this.logger = logger;
  }

  public async connect(): Promise<void> {
    if (!this.producer) {
      this.producer = this.client.getKafka().producer({
        allowAutoTopicCreation: true,
        transactionTimeout: 30000,
      });

      await this.producer.connect();
      this.isConnected = true;
      this.logger?.info('Kafka producer connected successfully');
    }
  }

  public async publish<T>(options: PublishMessageOptions<T>): Promise<RecordMetadata[]> {
    if (!this.isConnected || !this.producer) {
      await this.connect();
    }

    const payloadString =
      typeof options.value === 'string' ? options.value : JSON.stringify(options.value);

    try {
      const records = await this.producer!.send({
        topic: options.topic,
        messages: [
          {
            key: options.key,
            value: Buffer.from(payloadString),
            headers: options.headers,
            timestamp: Date.now().toString(),
          },
        ],
      });

      this.logger?.debug(
        {
          topic: options.topic,
          key: options.key,
          partition: records[0]?.partition,
          offset: records[0]?.offset,
        },
        'Kafka message published',
      );

      return records;
    } catch (error) {
      this.logger?.error(
        {
          topic: options.topic,
          key: options.key,
          error,
        },
        'Failed to publish message to Kafka',
      );
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.producer && this.isConnected) {
      await this.producer.disconnect();
      this.isConnected = false;
      this.producer = null;
      this.logger?.info('Kafka producer disconnected');
    }
  }
}
