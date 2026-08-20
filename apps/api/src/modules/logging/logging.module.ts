import { Module, Global } from '@nestjs/common';
import { createLogger, NestPinoLoggerAdapter, type AppLogger } from '@attendance/logging';
import { CONFIG_TOKEN } from '../config/config.module.js';
import { type AppConfig } from '@attendance/config';

export const LOGGER_TOKEN = 'APP_LOGGER';

@Global()
@Module({
  providers: [
    {
      provide: LOGGER_TOKEN,
      inject: [CONFIG_TOKEN],
      useFactory: (config: AppConfig): AppLogger => {
        return createLogger({
          serviceName: config.SERVICE_NAME,
          serviceVersion: config.SERVICE_VERSION,
          level: config.LOG_LEVEL,
          isDevelopment: config.NODE_ENV === 'development',
        });
      },
    },
    {
      provide: NestPinoLoggerAdapter,
      inject: [LOGGER_TOKEN],
      useFactory: (logger: AppLogger): NestPinoLoggerAdapter => {
        return new NestPinoLoggerAdapter(logger);
      },
    },
  ],
  exports: [LOGGER_TOKEN, NestPinoLoggerAdapter],
})
export class LoggingModule {}
