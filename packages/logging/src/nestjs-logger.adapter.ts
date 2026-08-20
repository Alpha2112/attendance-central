import { LoggerService } from '@nestjs/common';
import { AppLogger } from './logger.js';

export class NestPinoLoggerAdapter implements LoggerService {
  constructor(private readonly logger: AppLogger) {}

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.callLogger('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.callLogger('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.callLogger('warn', message, optionalParams);
  }

  debug?(message: unknown, ...optionalParams: unknown[]): void {
    this.callLogger('debug', message, optionalParams);
  }

  verbose?(message: unknown, ...optionalParams: unknown[]): void {
    this.callLogger('trace', message, optionalParams);
  }

  private callLogger(
    level: 'info' | 'error' | 'warn' | 'debug' | 'trace',
    message: unknown,
    optionalParams: unknown[],
  ): void {
    const context =
      typeof optionalParams[optionalParams.length - 1] === 'string'
        ? optionalParams[optionalParams.length - 1]
        : undefined;

    const extra =
      optionalParams.length > 0 && typeof optionalParams[0] === 'object' ? optionalParams[0] : {};

    const logFn = this.logger[level].bind(this.logger);

    if (typeof message === 'object' && message !== null) {
      logFn({ ...extra, context, ...message });
    } else {
      logFn({ ...extra, context }, String(message));
    }
  }
}
