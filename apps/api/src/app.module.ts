import { Module } from '@nestjs/common';
import { ConfigModule } from './modules/config/config.module.js';
import { LoggingModule } from './modules/logging/logging.module.js';
import { DatabaseModule } from './modules/database/database.module.js';
import { RedisModule } from './modules/redis/redis.module.js';
import { KafkaModule } from './modules/kafka/kafka.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { DevicesModule } from './modules/devices/devices.module.js';
import { MappingsModule } from './modules/mappings/mappings.module.js';
import { PunchesModule } from './modules/punches/punches.module.js';
import { IntegrationsModule } from './modules/integrations/integrations.module.js';
import { RegistryModule } from './modules/registry/registry.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { RolesModule } from './modules/roles/roles.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    DatabaseModule,
    RedisModule,
    KafkaModule,
    // AuthModule registers the global JwtAuthGuard + PermissionsGuard.
    AuthModule,
    // AuditModule registers the global audit interceptor + AuditService.
    AuditModule,
    HealthModule,
    DevicesModule,
    MappingsModule,
    PunchesModule,
    IntegrationsModule,
    RegistryModule,
    UsersModule,
    RolesModule,
    SettingsModule,
  ],
})
export class AppModule {}
