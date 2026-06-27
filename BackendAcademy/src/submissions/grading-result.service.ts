import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { GradingResultRepository } from './grading-result.repository';
import { SubmissionService } from './submission.service';
import { GradingResultEntity } from './entities/grading-result.entity';
import { SaveGradingResultDto } from './dto/save-grading-result.dto';
import { SubmissionStatus } from './interfaces/submission-status.enum';
import { GradingResultStatus } from './interfaces/grading-result-status.enum';

/**
 * Handles the business logic for saving and retrieving grading results.
 *
 * When a grading result is saved it also updates the parent submission's
 * `status`, `score`, and `feedback` fields so both records stay in sync.
 */
@Injectable()
export class GradingResultService {
  constructor(
    private readonly gradingResultRepo: GradingResultRepository,
    private readonly submissionService: SubmissionService,
  ) {}

  /**
   * Save a new grading result for a submission and synchronise the
   * parent submission record.
   *
   * @throws NotFoundException  if the submission does not exist.
   * @throws BadRequestException if score exceeds maxScore or maxScore ≤ 0.
   */
  async saveResult(
    submissionId: string,
    dto: SaveGradingResultDto,
  ): Promise<GradingResultEntity> {
    // Validate the submission exists
    const submission = await this.submissionService.findById(submissionId);
    if (!submission) {
      throw new NotFoundException(`Submission ${submissionId} not found`);
    }

    // Validate score bounds
    if (dto.maxScore <= 0) {
      throw new BadRequestException('maxScore must be greater than 0');
    }
    if (dto.score < 0 || dto.score > dto.maxScore) {
      throw new BadRequestException(
        `score must be between 0 and maxScore (${dto.maxScore})`,
      );
    }

    // Build the entity
    const entity = new GradingResultEntity({
      id: crypto.randomUUID(),
      submissionId,
      graderId: dto.graderId,
      status: dto.status,
      score: dto.score,
      maxScore: dto.maxScore,
      feedback: dto.feedback,
      privateNotes: dto.privateNotes,
      rubric: dto.rubric,
    });

    const saved = await this.gradingResultRepo.save(entity);

    // Derive the matching SubmissionStatus from the grading outcome
    const submissionStatus = this.toSubmissionStatus(dto.status);

    // Sync the parent submission
    await this.submissionService.review(
      submissionId,
      dto.graderId,
      submissionStatus,
      dto.feedback,
      dto.score,
    );

    return saved;
  }

  /**
   * Retrieve all grading results for a submission, oldest-first.
   *
   * @throws NotFoundException if the submission does not exist.
   */
  async getResultsBySubmission(submissionId: string): Promise<GradingResultEntity[]> {
    const submission = await this.submissionService.findById(submissionId);
    if (!submission) {
      throw new NotFoundException(`Submission ${submissionId} not found`);
    }
    return this.gradingResultRepo.findBySubmissionId(submissionId);
  }

  /**
   * Retrieve only the most recent grading result for a submission.
   *
   * @throws NotFoundException if the submission does not exist.
   */
  async getLatestResult(submissionId: string): Promise<GradingResultEntity | null> {
    const submission = await this.submissionService.findById(submissionId);
    if (!submission) {
      throw new NotFoundException(`Submission ${submissionId} not found`);
    }
    return this.gradingResultRepo.findLatestBySubmissionId(submissionId);
  }

  /**
   * Retrieve a single grading result by its ID.
   *
   * @throws NotFoundException if the result does not exist.
   */
  async getResultById(id: string): Promise<GradingResultEntity> {
    const result = await this.gradingResultRepo.findById(id);
    if (!result) {
      throw new NotFoundException(`Grading result ${id} not found`);
    }
    return result;
  }

  /**
   * Retrieve all grading results produced by a specific grader.
   */
  async getResultsByGrader(graderId: string): Promise<GradingResultEntity[]> {
    return this.gradingResultRepo.findByGraderId(graderId);
  }

  /**
   * Delete a grading result by ID.
   *
   * @throws NotFoundException if the result does not exist.
   */
  async deleteResult(id: string): Promise<void> {
    const deleted = await this.gradingResultRepo.delete(id);
    if (!deleted) {
      throw new NotFoundException(`Grading result ${id} not found`);
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Map a GradingResultStatus to the corresponding SubmissionStatus so that
   * the parent submission record is always consistent.
   */
  private toSubmissionStatus(gradingStatus: GradingResultStatus): SubmissionStatus {
    switch (gradingStatus) {
      case GradingResultStatus.PASS:
        return SubmissionStatus.APPROVED;
      case GradingResultStatus.FAIL:
        return SubmissionStatus.REJECTED;
      case GradingResultStatus.NEEDS_REVISION:
        return SubmissionStatus.NEEDS_REVISION;
      case GradingResultStatus.PARTIAL:
        // Partial credit: leave open for further review
        return SubmissionStatus.NEEDS_REVISION;
    }
  }
}
