import { z } from 'zod';

export const ApiConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SERVICE_NAME: z.string().default('attendance-api'),
  SERVICE_VERSION: z.string().default('1.0.0'),
  CORS_ORIGIN: z
    .string()
    .default('*')
    .transform((val) => val.split(',').map((s) => s.trim())),
  API_GLOBAL_PREFIX: z.string().default('api/v1'),
  // Auth / RBAC — JWT signing. Override JWT_SECRET in every real environment.
  JWT_SECRET: z.string().default('dev-insecure-change-me-attendance-jwt-secret'),
  JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(43200), // 12h
});

export type ApiConfig = z.infer<typeof ApiConfigSchema>;
