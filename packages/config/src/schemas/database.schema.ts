import { z } from 'zod';

export const DatabaseConfigSchema = z.object({
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(3307),
  DB_USERNAME: z.string().default('attendance_user'),
  DB_PASSWORD: z.string().default('attendance_pass'),
  DB_DATABASE: z.string().default('attendance_db'),
  DB_CONNECTION_LIMIT: z.coerce.number().int().positive().default(20),
  DB_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
});

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
