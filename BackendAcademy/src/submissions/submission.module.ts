import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChallengesModule } from '../challenges/challenges.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { GradingResultRepository } from './grading-result.repository';
import { GradingResultService } from './grading-result.service';
import { SubmissionController } from './submission.controller';
import { SubmissionService } from './submission.service';
import { TutorReviewController } from './tutor-review.controller';
import { TutorReviewService } from './tutor-review.service';

@Module({
  imports: [AuthModule, ChallengesModule, MonitoringModule],
  controllers: [SubmissionController, TutorReviewController],
  providers: [SubmissionService, GradingResultService, GradingResultRepository],
  exports: [SubmissionService, GradingResultService, TutorReviewService],
})
export class SubmissionModule {}
