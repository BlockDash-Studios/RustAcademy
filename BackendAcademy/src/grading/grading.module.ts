import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { PromptGuardService } from '../ai/prompt-guard.service';
import { GamificationModule } from '../gamification/gamification.module';
import { GradingController } from './grading.controller';
import { GradingService } from './grading.service';

/**
 * Grading pipeline (BE-037): AI pre-score → tutor confirm/override → rewards.
 *
 * Depends on `AiModule` for the Claude grader client and on `GamificationModule`
 * so a passing final score can publish a `task.passed` event on the shared
 * domain bus instead of re-implementing XP awarding here.
 */
@Module({
  imports: [AiModule, GamificationModule],
  controllers: [GradingController],
  providers: [GradingService, PromptGuardService],
  exports: [GradingService],
})
export class GradingModule {}
