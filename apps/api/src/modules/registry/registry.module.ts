import { Module } from '@nestjs/common';
import { RegistryService } from './registry.service.js';
import { TenantsController } from './tenants.controller.js';
import { OrganizationsController } from './organizations.controller.js';

@Module({
  controllers: [TenantsController, OrganizationsController],
  providers: [RegistryService],
  exports: [RegistryService],
})
export class RegistryModule {}
