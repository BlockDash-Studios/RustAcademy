import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GradingResultRepository } from './grading-result.repository';
import { GradingResultService } from './grading-result.service';
import { SubmissionController } from './submission.controller';
import { SubmissionService } from './submission.service';
import { TutorReviewController } from './tutor-review.controller';
import { TutorReviewService } from './tutor-review.service';

@Module({
  imports: [AuthModule],
  controllers: [SubmissionController, TutorReviewController],
  providers: [SubmissionService, GradingResultService, GradingResultRepository, TutorReviewService],
  exports: [SubmissionService, GradingResultService, TutorReviewService],
})
export class SubmissionModule {}
