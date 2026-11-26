import { Module } from '@nestjs/common';
import { PunchesController } from './punches.controller.js';
import { PunchesService } from './punches.service.js';
import { ManualSyncService } from './manual-sync.service.js';
import { KafkaModule } from '../kafka/kafka.module.js';

@Module({
  imports: [KafkaModule],
  controllers: [PunchesController],
  providers: [PunchesService, ManualSyncService],
  exports: [PunchesService, ManualSyncService],
})
export class PunchesModule {}
