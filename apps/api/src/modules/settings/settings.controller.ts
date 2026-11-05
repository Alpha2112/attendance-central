import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { AppConfig } from '@attendance/config';
import { CONFIG_TOKEN } from '../config/config.module.js';
import { RequirePermissions } from '../auth/decorators.js';

/**
 * Exposes NON-SENSITIVE platform configuration (host/port/names) for the
 * Settings page. Passwords/secrets are never returned. Gated by settings.view.
 */
@ApiTags('settings')
@ApiBearerAuth()
@Controller(['settings', 'api/v1/settings'])
export class SettingsController {
  constructor(@Inject(CONFIG_TOKEN) private readonly config: AppConfig) {}

  @Get('infra')
  @RequirePermissions('settings.view')
  @ApiOperation({ summary: 'Non-sensitive infrastructure configuration' })
  public infra() {
    const c = this.config;
    return {
      api: {
        host: c.HOST,
        port: c.PORT,
        version: c.SERVICE_VERSION,
        env: c.NODE_ENV,
      },
      database: {
        host: c.DB_HOST,
        port: c.DB_PORT,
        name: c.DB_DATABASE,
        poolLimit: c.DB_CONNECTION_LIMIT,
      },
      redis: {
        host: c.REDIS_HOST,
        port: c.REDIS_PORT,
        db: c.REDIS_DB,
        keyPrefix: c.REDIS_KEY_PREFIX,
      },
      kafka: {
        brokers: c.KAFKA_BROKERS,
        clientId: c.KAFKA_CLIENT_ID,
        groupId: c.KAFKA_GROUP_ID,
      },
    };
  }
}
