import { describe, it, expect } from 'vitest';
import {
  ApiConfigSchema,
  DatabaseConfigSchema,
  RedisConfigSchema,
  KafkaConfigSchema,
  loadConfig,
  loadAppConfig,
} from '../index.js';

describe('Config Package', () => {
  it('should parse defaults when empty env provided', () => {
    const config = loadConfig(ApiConfigSchema, {});
    expect(config.PORT).toBe(4000);
    expect(config.NODE_ENV).toBe('development');
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.SERVICE_NAME).toBe('attendance-api');
  });

  it('should coerce and parse custom values', () => {
    const custom = {
      PORT: '5050',
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn',
      SERVICE_NAME: 'attendance-collector',
      CORS_ORIGIN: 'http://example.com, https://app.example.com',
      API_GLOBAL_PREFIX: 'api/v2',
    };
    const config = loadConfig(ApiConfigSchema, custom);
    expect(config.PORT).toBe(5050);
    expect(config.NODE_ENV).toBe('production');
    expect(config.LOG_LEVEL).toBe('warn');
    expect(config.CORS_ORIGIN).toEqual(['http://example.com', 'https://app.example.com']);
  });

  it('should parse database, redis, and kafka configs with defaults', () => {
    const dbConfig = loadConfig(DatabaseConfigSchema, {});
    expect(dbConfig.DB_PORT).toBe(3307);
    expect(dbConfig.DB_DATABASE).toBe('attendance_db');

    const redisConfig = loadConfig(RedisConfigSchema, {});
    expect(redisConfig.REDIS_PORT).toBe(6379);

    const kafkaConfig = loadConfig(KafkaConfigSchema, {});
    expect(kafkaConfig.KAFKA_BROKERS).toEqual(['127.0.0.1:9092']);
  });

  it('should throw validation error on invalid configuration input', () => {
    expect(() =>
      loadConfig(DatabaseConfigSchema, {
        DB_PORT: '-100', // Invalid positive integer
      }),
    ).toThrowError(/Configuration validation failed/);
  });

  it('should load combined AppConfig successfully', () => {
    const appConfig = loadAppConfig({});
    expect(appConfig.PORT).toBe(4000);
    expect(appConfig.DB_PORT).toBe(3307);
    expect(appConfig.REDIS_PORT).toBe(6379);
    expect(appConfig.KAFKA_BROKERS).toEqual(['127.0.0.1:9092']);
  });
});
