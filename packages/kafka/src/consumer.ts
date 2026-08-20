import { type Consumer, type EachMessagePayload } from 'kafkajs';
import { KafkaClient } from './client.js';
import { type AppLogger } from '@attendance/logging';
import { type KafkaTopic } from '@attendance/contracts';

export interface ConsumerHandler<T = unknown> {
  (message: {
    topic: string;
    partition: number;
    offset: string;
    key: string | null;
    value: T;
    headers: Record<string, string | undefined>;
    timestamp: string;
  }): Promise<void>;
}

export class KafkaConsumerService {
  private consumer: Consumer | null = null;
  private isRunning = false;
  private readonly logger?: AppLogger;

  constructor(
    private readonly client: KafkaClient,
    private readonly groupId: string,
    logger?: AppLogger,
  ) {
    this.logger = logger;
  }

  public async subscribe<T>(
    topics: (KafkaTopic | string)[],
    handler: ConsumerHandler<T>,
  ): Promise<void> {
    if (this.consumer) {
      throw new Error('Consumer is already initialized and subscribed');
    }

    this.consumer = this.client.getKafka().consumer({
      groupId: this.groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
      allowAutoTopicCreation: true,
    });

    await this.consumer.connect();
    this.logger?.info({ groupId: this.groupId }, 'Kafka consumer connected');

    for (const topic of topics) {
      await this.consumer.subscribe({ topic, fromBeginning: false });
      this.logger?.info({ topic, groupId: this.groupId }, 'Subscribed to Kafka topic');
    }

    this.isRunning = true;

    await this.consumer.run({
      autoCommit: true,
      eachMessage: async (payload: EachMessagePayload) => {
        const { topic, partition, message } = payload;
        const key = message.key ? message.key.toString('utf-8') : null;
        const rawValue = message.value ? message.value.toString('utf-8') : '';

        let parsedValue: T;
        try {
          parsedValue = JSON.parse(rawValue) as T;
        } catch {
          parsedValue = rawValue as unknown as T;
        }

        const headers: Record<string, string | undefined> = {};
        if (message.headers) {
          for (const [k, v] of Object.entries(message.headers)) {
            headers[k] = v ? v.toString() : undefined;
          }
        }

        try {
          await handler({
            topic,
            partition,
            offset: message.offset,
            key,
            value: parsedValue,
            headers,
            timestamp: message.timestamp,
          });
        } catch (error) {
          this.logger?.error(
            {
              topic,
              partition,
              offset: message.offset,
              key,
              error,
            },
            'Error processing Kafka message in consumer',
          );
          throw error;
        }
      },
    });
  }

  public async disconnect(): Promise<void> {
    if (this.consumer && this.isRunning) {
      await this.consumer.disconnect();
      this.isRunning = false;
      this.consumer = null;
      this.logger?.info({ groupId: this.groupId }, 'Kafka consumer disconnected');
    }
  }
}
