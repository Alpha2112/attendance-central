import { Module } from '@nestjs/common';
import { PunchesController } from './punches.controller.js';
import { PunchesService } from './punches.service.js';
import { KafkaModule } from '../kafka/kafka.module.js';

@Module({
  imports: [KafkaModule],
  controllers: [PunchesController],
  providers: [PunchesService],
  exports: [PunchesService],
})
export class PunchesModule {}
