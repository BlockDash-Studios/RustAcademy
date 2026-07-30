import { Module } from '@nestjs/common';
import { ChallengesModule } from '../challenges/challenges.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { SecurityModule } from '../security/security.module';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';

@Module({
  imports: [ChallengesModule, MonitoringModule, SecurityModule],
  controllers: [SubmissionsController],
  providers: [SubmissionsService],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
