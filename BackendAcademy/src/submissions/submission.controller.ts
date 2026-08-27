import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { SubmissionService } from './submission.service';
import { GradingResultService } from './grading-result.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';
import { SaveDraftDto } from './dto/save-draft.dto';
import { SaveGradingResultDto } from './dto/save-grading-result.dto';
import { SubmissionStatus } from './interfaces/submission-status.enum';
import { SubmissionEntity } from './submission.entity';
import {
  JwtAuthGuard,
  RolesGuard,
  SubjectOwnershipGuard,
  Roles,
  Ownership,
  UserRole,
  JwtPayload,
  assertOwnerOrStaff,
} from '../auth';

type AuthedRequest = Request & { user: JwtPayload };

/**
 * Submission API.
 *
 * Learners manage their own submissions (subject ownership verified against
 * the JWT subject); tutors and admins operate the review/grading surface.
 */
@Controller('submissions')
export class SubmissionController {
  constructor(
    private readonly submissionService: SubmissionService,
    private readonly gradingResultService: GradingResultService,
  ) {}

  // ---------------------------------------------------------------------------
  // Submission CRUD
  // ---------------------------------------------------------------------------

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEARNER, UserRole.ADMIN)
  async create(@Body() dto: CreateSubmissionDto, @Req() req: AuthedRequest) {
    // The authoring learner always comes from the JWT, never the payload.
    return this.submissionService.create({ ...dto, userId: req.user.sub });
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TUTOR, UserRole.ADMIN)
  async findAll() {
    return this.submissionService.findAll();
  }

  @Get('task/:taskId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TUTOR, UserRole.ADMIN)
  async findByTaskId(@Param('taskId') taskId: string) {
    return this.submissionService.findByTaskId(taskId);
  }

  @Get('user/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard, SubjectOwnershipGuard)
  @Roles(UserRole.LEARNER, UserRole.ADMIN)
  @Ownership('userId')
  async findByUserId(@Param('userId') userId: string) {
    return this.submissionService.findByUserId(userId);
  }

  @Get('user/:userId/drafts')
  @UseGuards(JwtAuthGuard, RolesGuard, SubjectOwnershipGuard)
  @Roles(UserRole.LEARNER, UserRole.ADMIN)
  @Ownership('userId')
  async findDraftsByUserId(@Param('userId') userId: string) {
    return this.submissionService.findDraftsByUserId(userId);
  }

  @Get('status/:status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TUTOR, UserRole.ADMIN)
  async findByStatus(@Param('status') status: SubmissionStatus) {
    return this.submissionService.findByStatus(status);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEARNER, UserRole.TUTOR, UserRole.ADMIN)
  async findById(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    const submission = await this.submissionService.findById(id);
    if (!submission) throw new NotFoundException('Submission not found');
    assertOwnerOrStaff(req.user, submission.userId, [UserRole.TUTOR, UserRole.ADMIN], 'submission');
    return submission;
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEARNER, UserRole.TUTOR, UserRole.ADMIN)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubmissionDto,
    @Req() req: AuthedRequest,
  ) {
    const submission = await this.submissionService.findById(id);
    if (!submission) throw new NotFoundException('Submission not found');
    assertOwnerOrStaff(req.user, submission.userId, [UserRole.TUTOR, UserRole.ADMIN], 'submission');
    // Ownership fields are immutable through this generic update path.
    return this.submissionService.update(id, {
      ...dto,
      userId: submission.userId,
      reviewedBy: submission.reviewedBy,
    } as UpdateSubmissionDto);
  }

  @Post(':id/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TUTOR, UserRole.ADMIN)
  async review(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthedRequest,
    @Body('status') status: SubmissionStatus,
    @Body('feedback') feedback?: string,
    @Body('score') score?: number,
  ) {
    return this.submissionService.review(id, req.user.sub, status, feedback, score);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEARNER, UserRole.TUTOR, UserRole.ADMIN)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    const submission = await this.submissionService.findById(id);
    if (!submission) throw new NotFoundException('Submission not found');
    assertOwnerOrStaff(req.user, submission.userId, [UserRole.TUTOR, UserRole.ADMIN], 'submission');
    return this.submissionService.remove(id);
  }

  // ---------------------------------------------------------------------------
  // Draft endpoints
  // ---------------------------------------------------------------------------

  /**
   * POST /submissions/draft
   *
   * Create or update a draft submission. If a draft already exists for the
   * same userId + taskId it is updated (upsert). Otherwise a new draft is
   * created with status = DRAFT.
   */
  @Post('draft')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEARNER, UserRole.ADMIN)
  async saveDraft(@Body() dto: SaveDraftDto, @Req() req: AuthedRequest) {
    return this.submissionService.saveDraft({ ...dto, userId: req.user.sub });
  }

  /**
   * POST /submissions/:id/publish
   *
   * Promote a draft submission to PENDING status, entering the normal review
   * workflow. Returns 400 if the submission is not a draft.
   */
  @Post(':id/publish')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEARNER, UserRole.TUTOR, UserRole.ADMIN)
  async publishDraft(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    const submission = await this.submissionService.findById(id);
    if (!submission) throw new NotFoundException('Submission not found');
    assertOwnerOrStaff(req.user, submission.userId, [UserRole.TUTOR, UserRole.ADMIN], 'submission');
    return this.submissionService.publishDraft(id);
  }

  // ---------------------------------------------------------------------------
  // Grading results
  // ---------------------------------------------------------------------------

  /**
   * POST /submissions/:id/grade
   *
   * Save a grading result for a submission.  Also updates the parent
   * submission's status, score, and feedback to keep them in sync.
   */
  @Post(':id/grade')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TUTOR, UserRole.ADMIN)
  async saveGradingResult(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveGradingResultDto,
    @Req() req: AuthedRequest,
  ) {
    // The grader identity always comes from the JWT.
    return this.gradingResultService.saveResult(id, { ...dto, graderId: req.user.sub });
  }

  /**
   * GET /submissions/:id/grades
   *
   * Retrieve all grading results for a submission, oldest-first.
   */
  @Get(':id/grades')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TUTOR, UserRole.ADMIN)
  async getGradingResults(@Param('id', ParseUUIDPipe) id: string) {
    return this.gradingResultService.getResultsBySubmission(id);
  }

  /**
   * GET /submissions/:id/grades/latest
   *
   * Retrieve only the most recent grading result for a submission.
   */
  @Get(':id/grades/latest')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TUTOR, UserRole.ADMIN)
  async getLatestGradingResult(@Param('id', ParseUUIDPipe) id: string) {
    return this.gradingResultService.getLatestResult(id);
  }

  /**
   * GET /submissions/grades/:gradeId
   *
   * Retrieve a single grading result by its own ID.
   */
  @Get('grades/:gradeId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TUTOR, UserRole.ADMIN)
  async getGradingResultById(@Param('gradeId', ParseUUIDPipe) gradeId: string) {
    return this.gradingResultService.getResultById(gradeId);
  }

  /**
   * DELETE /submissions/grades/:gradeId
   *
   * Delete a grading result by its own ID.
   */
  @Delete('grades/:gradeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TUTOR, UserRole.ADMIN)
  async deleteGradingResult(@Param('gradeId', ParseUUIDPipe) gradeId: string) {
    await this.gradingResultService.deleteResult(gradeId);
  }
}