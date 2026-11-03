import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller.js';
import { IntegrationsService } from './integrations.service.js';
import { WebhookDispatcherRunner } from './webhook-dispatcher.runner.js';

@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService, WebhookDispatcherRunner],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
