import { Injectable } from '@nestjs/common';
import { GradingResultEntity } from './entities/grading-result.entity';

/**
 * Repository for GradingResultEntity.
 *
 * Currently backed by an in-memory Map — consistent with other BackendAcademy
 * repositories.  When TypeORM is wired up, swap the Map for a TypeORM
 * `Repository<GradingResultEntity>` injected via `@InjectRepository()`.
 */
@Injectable()
export class GradingResultRepository {
  private readonly store: Map<string, GradingResultEntity> = new Map();

  /**
   * Persist a new grading result.
   */
  async save(entity: GradingResultEntity): Promise<GradingResultEntity> {
    this.store.set(entity.id, entity);
    return entity;
  }

  /**
   * Retrieve a grading result by its own ID.
   */
  async findById(id: string): Promise<GradingResultEntity | null> {
    return this.store.get(id) ?? null;
  }

  /**
   * Retrieve all grading results for a given submission, ordered
   * oldest-first so the last element is the most recent grade.
   */
  async findBySubmissionId(submissionId: string): Promise<GradingResultEntity[]> {
    return Array.from(this.store.values())
      .filter((r) => r.submissionId === submissionId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  /**
   * Retrieve the most recently saved grading result for a submission.
   * Returns `null` if the submission has never been graded.
   */
  async findLatestBySubmissionId(submissionId: string): Promise<GradingResultEntity | null> {
    const results = await this.findBySubmissionId(submissionId);
    return results.length > 0 ? results[results.length - 1] : null;
  }

  /**
   * Retrieve all results produced by a specific grader.
   */
  async findByGraderId(graderId: string): Promise<GradingResultEntity[]> {
    return Array.from(this.store.values())
      .filter((r) => r.graderId === graderId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Remove a grading result by ID.
   * Returns `true` if it existed and was deleted, `false` otherwise.
   */
  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}
