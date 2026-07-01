import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';

import { TutorReviewService, ReviewQueuePage, ReviewStats } from './tutor-review.service';
import { ReviewSubmissionDto } from './dto/review-submission.dto';
import { ReviewQueueQueryDto } from './dto/review-queue-query.dto';
import { JwtTutorGuard } from '../auth/guards/jwt-tutor.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

type AuthedRequest = Request & { tutor: JwtPayload };

/**
 * Tutor Review Queue API
 *
 * All routes require a valid tutor JWT (`Authorization: Bearer <token>`).
 *
 * Base path: /tutor/review
 *
 * ┌──────────────────────────────────────────────────────────┐
 * │ GET  /tutor/review/queue/pending         Pending queue   │
 * │ GET  /tutor/review/queue/needs-revision  Revision queue  │
 * │ GET  /tutor/review/stats                 Status counts   │
 * │ GET  /tutor/review/history               Reviewed by me  │
 * │ POST /tutor/review/:id                   Review a sub    │
 * └──────────────────────────────────────────────────────────┘
 */
@UseGuards(JwtTutorGuard)
@Controller('tutor/review')
export class TutorReviewController {
  constructor(private readonly tutorReviewService: TutorReviewService) {}

  // ─── Queue ────────────────────────────────────────────────────────────────

  /**
   * GET /tutor/review/queue/pending
   *
   * Returns submissions waiting for a first review, ordered oldest-first
   * (FIFO).  Supports optional `taskId` filter and cursor-based pagination.
   *
   * Query params:
   *   taskId?  – filter to a specific task
   *   limit?   – page size (1–100, default 20)
   *   cursor?  – last-seen submission ID for the next page
   */
  @Get('queue/pending')
  async getPendingQueue(
    @Query() query: ReviewQueueQueryDto,
  ): Promise<ReviewQueuePage> {
    return this.tutorReviewService.getPendingQueue(query);
  }

  /**
   * GET /tutor/review/queue/needs-revision
   *
   * Returns submissions the learner has resubmitted after feedback,
   * ordered by last-updated time ascending.
   *
   * Accepts the same query params as /queue/pending.
   */
  @Get('queue/needs-revision')
  async getNeedsRevisionQueue(
    @Query() query: ReviewQueueQueryDto,
  ): Promise<ReviewQueuePage> {
    return this.tutorReviewService.getNeedsRevisionQueue(query);
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  /**
   * GET /tutor/review/stats
   *
   * Returns a count breakdown across all statuses.
   *
   * Query params:
   *   taskId? – scope counts to a single task
   */
  @Get('stats')
  async getStats(@Query('taskId') taskId?: string): Promise<ReviewStats> {
    return this.tutorReviewService.getStats(taskId);
  }

  // ─── History ──────────────────────────────────────────────────────────────

  /**
   * GET /tutor/review/history
   *
   * Returns submissions previously reviewed by the calling tutor,
   * newest-reviewed first.
   *
   * Accepts the same query params as /queue/pending.
   */
  @Get('history')
  async getReviewHistory(
    @Req() req: AuthedRequest,
    @Query() query: ReviewQueueQueryDto,
  ): Promise<ReviewQueuePage> {
    return this.tutorReviewService.getReviewedByTutor(req.tutor.sub, query);
  }

  // ─── Review action ────────────────────────────────────────────────────────

  /**
   * POST /tutor/review/:id
   *
   * Submit a review decision for a single submission.
   *
   * Body: ReviewSubmissionDto
   *   status   – "approved" | "rejected" | "needs_revision"
   *   feedback – optional written feedback
   *   score    – optional 0–100 numeric score
   *
   * Returns the updated submission.
   *
   * Errors:
   *   404 – submission not found
   *   400 – submission is not in a reviewable state, invalid status/score
   */
  @Post(':id')
  @HttpCode(HttpStatus.OK)
  async reviewSubmission(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthedRequest,
    @Body() dto: ReviewSubmissionDto,
  ) {
    return this.tutorReviewService.reviewSubmission(id, req.tutor.sub, dto);
  }
}
