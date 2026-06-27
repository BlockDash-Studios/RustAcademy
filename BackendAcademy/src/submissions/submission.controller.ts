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
} from '@nestjs/common';
import { SubmissionService } from './submission.service';
import { GradingResultService } from './grading-result.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';
import { SaveGradingResultDto } from './dto/save-grading-result.dto';
import { SubmissionStatus } from './interfaces/submission-status.enum';

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
  async create(@Body() dto: CreateSubmissionDto) {
    return this.submissionService.create(dto);
  }

  @Get()
  async findAll() {
    return this.submissionService.findAll();
  }

  @Get('task/:taskId')
  async findByTaskId(@Param('taskId') taskId: string) {
    return this.submissionService.findByTaskId(taskId);
  }

  @Get('user/:userId')
  async findByUserId(@Param('userId') userId: string) {
    return this.submissionService.findByUserId(userId);
  }

  @Get('status/:status')
  async findByStatus(@Param('status') status: SubmissionStatus) {
    return this.submissionService.findByStatus(status);
  }

  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.submissionService.findById(id);
  }

  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubmissionDto,
  ) {
    return this.submissionService.update(id, dto);
  }

  @Post(':id/review')
  async review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reviewedBy') reviewerId: string,
    @Body('status') status: SubmissionStatus,
    @Body('feedback') feedback?: string,
    @Body('score') score?: number,
  ) {
    return this.submissionService.review(id, reviewerId, status, feedback, score);
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.submissionService.remove(id);
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
  async saveGradingResult(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveGradingResultDto,
  ) {
    return this.gradingResultService.saveResult(id, dto);
  }

  /**
   * GET /submissions/:id/grades
   *
   * Retrieve all grading results for a submission, oldest-first.
   */
  @Get(':id/grades')
  async getGradingResults(@Param('id', ParseUUIDPipe) id: string) {
    return this.gradingResultService.getResultsBySubmission(id);
  }

  /**
   * GET /submissions/:id/grades/latest
   *
   * Retrieve only the most recent grading result for a submission.
   */
  @Get(':id/grades/latest')
  async getLatestGradingResult(@Param('id', ParseUUIDPipe) id: string) {
    return this.gradingResultService.getLatestResult(id);
  }

  /**
   * GET /submissions/grades/:gradeId
   *
   * Retrieve a single grading result by its own ID.
   */
  @Get('grades/:gradeId')
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
  async deleteGradingResult(@Param('gradeId', ParseUUIDPipe) gradeId: string) {
    await this.gradingResultService.deleteResult(gradeId);
  }
}
