import pino, { type Logger, type LoggerOptions } from 'pino';
import { DEFAULT_REDACT_PATHS, REDACT_CENSOR } from './redact.js';

export interface CreateLoggerOptions {
  serviceName: string;
  serviceVersion?: string;
  level?: string;
  isDevelopment?: boolean;
  extraRedactPaths?: string[];
}

export type AppLogger = Logger;

export function createLogger(options: CreateLoggerOptions): AppLogger {
  const isDev = options.isDevelopment ?? process.env['NODE_ENV'] === 'development';
  const level = options.level || process.env['LOG_LEVEL'] || 'info';

  const redactPaths = Array.from(
    new Set([...DEFAULT_REDACT_PATHS, ...(options.extraRedactPaths || [])]),
  );

  const baseOptions: LoggerOptions = {
    level,
    base: {
      service: options.serviceName,
      version: options.serviceVersion || '1.0.0',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: redactPaths,
      censor: REDACT_CENSOR,
    },
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  };

  if (isDev) {
    return pino({
      ...baseOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  return pino(baseOptions);
}

export function createChildLogger(
  parent: AppLogger,
  context: {
    correlationId?: string;
    organizationId?: string;
    tenantId?: string;
    deviceId?: string;
    module?: string;
    [key: string]: unknown;
  },
): AppLogger {
  return parent.child(context);
}
