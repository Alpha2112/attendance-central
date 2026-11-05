import { Module, Global } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';
import { AuditInterceptor } from './audit.interceptor.js';

/**
 * Centralized audit logging. Global so AuditService can be injected anywhere
 * (auth flow, guards). The global interceptor records every authenticated
 * mutating request automatically.
 */
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
  exports: [AuditService],
})
export class AuditModule {}
