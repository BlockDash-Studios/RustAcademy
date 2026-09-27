import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { TutorReviewDto } from './dto/tutor-review.dto';
import { GradingService } from './grading.service';

/** REST surface for the AI pre-score → tutor review grading pipeline (BE-037). */
@ApiTags('grading')
@Controller('v1/grading')
export class GradingController {
  constructor(private readonly gradingService: GradingService) {}

  @Post('submissions')
  @ApiOperation({ summary: 'Submit a learner task submission for AI pre-scoring' })
  createSubmission(@Body() dto: CreateSubmissionDto) {
    return this.gradingService.createSubmission(dto);
  }

  @Post('submissions/:submissionId/ai-pre-score')
  @ApiOperation({ summary: 'Stage 1 — run the AI grader and record its score + feedback' })
  runAiPreScore(@Param('submissionId') submissionId: string) {
    return this.gradingService.runAiPreScore(submissionId);
  }

  @Post('submissions/:submissionId/review')
  @ApiOperation({ summary: 'Stage 2 — tutor confirms or overrides the AI pre-score' })
  tutorReview(@Param('submissionId') submissionId: string, @Body() dto: TutorReviewDto) {
    return this.gradingService.tutorReview(submissionId, dto);
  }

  @Get('submissions/:submissionId')
  @ApiOperation({ summary: 'Fetch a submission with its AI pre-score and tutor review' })
  getSubmission(@Param('submissionId') submissionId: string) {
    return this.gradingService.getSubmission(submissionId);
  }

  @Get('submissions/:submissionId/history')
  @ApiOperation({ summary: 'Append-only audit trail of a submission’s status transitions' })
  getHistory(@Param('submissionId') submissionId: string) {
    return { submissionId, transitions: this.gradingService.getHistory(submissionId) };
  }

  @Get('queue')
  @ApiOperation({ summary: 'AI pre-scored submissions awaiting tutor review' })
  getReviewQueue() {
    return { submissions: this.gradingService.getReviewQueue() };
  }
}
