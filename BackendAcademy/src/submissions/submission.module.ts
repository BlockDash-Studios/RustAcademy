import { Module } from '@nestjs/common';
import { SubmissionController } from './submission.controller';
import { SubmissionService } from './submission.service';
import { TutorReviewController } from './tutor-review.controller';
import { TutorReviewService } from './tutor-review.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    // Provides JwtService for JwtTutorGuard
    AuthModule,
  ],
  controllers: [SubmissionController, TutorReviewController],
  providers: [SubmissionService, TutorReviewService],
  exports: [SubmissionService, TutorReviewService],
import { GradingResultService } from './grading-result.service';
import { GradingResultRepository } from './grading-result.repository';

@Module({
  controllers: [SubmissionController],
  providers: [SubmissionService, GradingResultService, GradingResultRepository],
  exports: [SubmissionService, GradingResultService],
})
export class SubmissionModule {}
