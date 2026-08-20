import { z } from 'zod';

export const KafkaConfigSchema = z.object({
  KAFKA_BROKERS: z
    .string()
    .default('127.0.0.1:9092')
    .transform((val) => val.split(',').map((s) => s.trim())),
  KAFKA_CLIENT_ID: z.string().default('attendance-platform'),
  KAFKA_GROUP_ID: z.string().default('attendance-platform-group'),
  KAFKA_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  KAFKA_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
});

export type KafkaConfig = z.infer<typeof KafkaConfigSchema>;
