import { Module } from '@nestjs/common';
import { GamificationModule } from '../gamification/gamification.module';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

/**
 * Per-learner progress tracking (BE-038).
 *
 * Imports GamificationModule so task/course completions publish onto the shared
 * DomainEventBus and XP is priced by XpService rather than duplicated here.
 */
@Module({
  imports: [GamificationModule],
  controllers: [ProgressController],
  providers: [ProgressService],
  exports: [ProgressService],
})
export class ProgressModule {}
