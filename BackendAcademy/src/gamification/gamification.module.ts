import { Module } from '@nestjs/common';
import { DomainEventBus } from './domain-event-bus';
import { XpController } from './xp.controller';
import { XpService } from './xp.service';

@Module({
  controllers: [XpController],
  providers: [DomainEventBus, XpService],
  exports: [DomainEventBus, XpService],
})
export class GamificationModule {}
