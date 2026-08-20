import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import { ApiConfigSchema, type ApiConfig } from './schemas/api.schema.js';
import { DatabaseConfigSchema, type DatabaseConfig } from './schemas/database.schema.js';
import { RedisConfigSchema, type RedisConfig } from './schemas/redis.schema.js';
import { KafkaConfigSchema, type KafkaConfig } from './schemas/kafka.schema.js';

// Robust monorepo root .env finder
function loadRootEnv(): void {
  let currentDir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const envPath = path.resolve(currentDir, '.env');
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      return;
    }
    const nextDir = path.dirname(currentDir);
    if (nextDir === currentDir) break;
    currentDir = nextDir;
  }
  dotenv.config();
}

loadRootEnv();

export const AppConfigSchema = ApiConfigSchema.merge(DatabaseConfigSchema)
  .merge(RedisConfigSchema)
  .merge(KafkaConfigSchema);

export type AppConfig = z.infer<typeof AppConfigSchema>;

export function loadConfig<T extends z.ZodTypeAny>(
  schema: T,
  source: Record<string, unknown> = process.env,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map((err) => `${err.path.join('.')}: ${err.message}`)
      .join(', ');
    throw new Error(`Configuration validation failed: ${errorDetails}`);
  }
  return result.data;
}

export function loadAppConfig(source: Record<string, unknown> = process.env): AppConfig {
  return loadConfig(AppConfigSchema, source);
}

export function loadApiConfig(source: Record<string, unknown> = process.env): ApiConfig {
  return loadConfig(ApiConfigSchema, source);
}

export function loadDatabaseConfig(source: Record<string, unknown> = process.env): DatabaseConfig {
  return loadConfig(DatabaseConfigSchema, source);
}

export function loadRedisConfig(source: Record<string, unknown> = process.env): RedisConfig {
  return loadConfig(RedisConfigSchema, source);
}

export function loadKafkaConfig(source: Record<string, unknown> = process.env): KafkaConfig {
  return loadConfig(KafkaConfigSchema, source);
}
