import { describe, it, expect } from 'vitest';
import { KafkaClient, KafkaProducer, KafkaHealthIndicator } from '../index.js';

describe('Kafka Package', () => {
  const dummyConfig = {
    KAFKA_BROKERS: ['127.0.0.1:9092'],
    KAFKA_CLIENT_ID: 'test-client',
    KAFKA_GROUP_ID: 'test-group',
    KAFKA_CONNECTION_TIMEOUT_MS: 1000,
    KAFKA_REQUEST_TIMEOUT_MS: 1000,
  };

  it('should initialize KafkaClient, Producer, and HealthIndicator', () => {
    const client = new KafkaClient({ config: dummyConfig });
    expect(client).toBeDefined();

    const producer = new KafkaProducer(client);
    expect(producer).toBeDefined();

    const health = new KafkaHealthIndicator(client);
    expect(health).toBeDefined();
  });
});
