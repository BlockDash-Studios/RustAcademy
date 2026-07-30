import { Injectable, NotFoundException } from '@nestjs/common';
import { OnboardingProgress } from './onboarding.entity';
import { CreateOnboardingProgressDto } from './dto/create-onboarding-progress.dto';
import { UpdateOnboardingProgressDto } from './dto/update-onboarding-progress.dto';

/**
 * #355: A milestone checkpoint records when a specific onboarding
 * step was completed with optional metadata for recovery and reporting.
 */
export interface OnboardingCheckpoint {
  stepName: string;
  completedAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * #355: A point-in-time snapshot of onboarding progress for reporting
 * and milestone-based recovery.
 */
export interface OnboardingProgressSnapshot {
  id: string;
  userId: string;
  currentStep: string;
  completedSteps: string[];
  checkpoints: OnboardingCheckpoint[];
  totalSteps: number;
  isComplete: boolean;
  completionPercent: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class OnboardingService {
  private readonly progressMap: Map<string, OnboardingProgress> = new Map();

  /** #355: Checkpoints per onboarding progress ID. */
  private readonly checkpointsMap: Map<string, OnboardingCheckpoint[]> = new Map();

  /** #355: Historical snapshots per progress ID. */
  private readonly snapshotsMap: Map<string, OnboardingProgressSnapshot[]> = new Map();

  async create(
    dto: CreateOnboardingProgressDto,
  ): Promise<OnboardingProgress> {
    const progress = new OnboardingProgress({
      id: crypto.randomUUID(),
      ...dto,
      completedSteps: [],
      isComplete: false,
    });
    this.progressMap.set(progress.id, progress);
    this.checkpointsMap.set(progress.id, []);
    this.snapshotsMap.set(progress.id, []);
    return progress;
  }

  async findByUserId(
    userId: string,
  ): Promise<OnboardingProgress | null> {
    return (
      Array.from(this.progressMap.values()).find(
        (p) => p.userId === userId,
      ) || null
    );
  }

  async update(
    id: string,
    dto: UpdateOnboardingProgressDto,
  ): Promise<OnboardingProgress | null> {
    const progress = this.progressMap.get(id);
    if (!progress) return null;
    Object.assign(progress, dto, { updatedAt: new Date() });
    return progress;
  }

  async completeStep(
    id: string,
    step: string,
  ): Promise<OnboardingProgress> {
    const progress = this.progressMap.get(id);
    if (!progress)
      throw new NotFoundException('Onboarding progress not found');

    if (!progress.completedSteps.includes(step)) {
      progress.completedSteps.push(step);
    }
    progress.currentStep = step;
    progress.updatedAt = new Date();

    // #355: Record a checkpoint for this step completion
    this.recordCheckpoint(id, step);

    if (
      progress.totalSteps > 0 &&
      progress.completedSteps.length >= progress.totalSteps
    ) {
      progress.isComplete = true;
      progress.completedAt = new Date();
    }

    return progress;
  }

  // ──────────────────────────────────────────────────────────────────
  // #355: Checkpoint and snapshot API
  // ──────────────────────────────────────────────────────────────────

  /**
   * Records a milestone checkpoint when a step is completed.
   */
  recordCheckpoint(
    progressId: string,
    stepName: string,
    metadata?: Record<string, unknown>,
  ): OnboardingCheckpoint {
    const checkpoint: OnboardingCheckpoint = {
      stepName,
      completedAt: new Date(),
      metadata,
    };

    const checkpoints = this.checkpointsMap.get(progressId) ?? [];
    checkpoints.push(checkpoint);
    this.checkpointsMap.set(progressId, checkpoints);

    return checkpoint;
  }

  /**
   * Returns all checkpoints for a given onboarding progress.
   */
  getCheckpoints(progressId: string): OnboardingCheckpoint[] {
    return this.checkpointsMap.get(progressId) ?? [];
  }

  /**
   * Returns checkpoints between two dates (inclusive) for recovery/reporting.
   */
  getCheckpointsInRange(
    progressId: string,
    startDate: Date,
    endDate: Date,
  ): OnboardingCheckpoint[] {
    return this.getCheckpoints(progressId).filter(
      (c) => c.completedAt >= startDate && c.completedAt <= endDate,
    );
  }

  /**
   * #355: Creates a point-in-time snapshot of current progress.
   * Snapshots are append-only and used for milestone-based recovery.
   */
  createSnapshot(progressId: string): OnboardingProgressSnapshot {
    const progress = this.progressMap.get(progressId);
    if (!progress)
      throw new NotFoundException('Onboarding progress not found');

    const checkpoints = this.getCheckpoints(progressId);
    const completionPercent =
      progress.totalSteps > 0
        ? Math.round((progress.completedSteps.length / progress.totalSteps) * 100)
        : 0;

    const snapshot: OnboardingProgressSnapshot = {
      id: crypto.randomUUID(),
      userId: progress.userId,
      currentStep: progress.currentStep,
      completedSteps: [...progress.completedSteps],
      checkpoints: [...checkpoints],
      totalSteps: progress.totalSteps,
      isComplete: progress.isComplete,
      completionPercent,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const snapshots = this.snapshotsMap.get(progressId) ?? [];
    snapshots.push(snapshot);
    this.snapshotsMap.set(progressId, snapshots);

    return snapshot;
  }

  /**
   * Returns all historical snapshots for a given onboarding progress.
   */
  getSnapshots(progressId: string): OnboardingProgressSnapshot[] {
    return this.snapshotsMap.get(progressId) ?? [];
  }

  /**
   * #355: Returns the most recent snapshot for milestone-based recovery.
   * If no snapshot exists, creates one from the current state.
   */
  getLatestSnapshot(progressId: string): OnboardingProgressSnapshot {
    const snapshots = this.getSnapshots(progressId);
    if (snapshots.length > 0) {
      return snapshots[snapshots.length - 1];
    }
    return this.createSnapshot(progressId);
  }

  /**
   * #355: Recovers progress from a snapshot, restoring the completed
   * steps and checkpoint state from the most recent snapshot.
   */
  recoverFromSnapshot(progressId: string): OnboardingProgressSnapshot | null {
    const snapshots = this.getSnapshots(progressId);
    if (snapshots.length === 0) return null;

    const latest = snapshots[snapshots.length - 1];
    const progress = this.progressMap.get(progressId);
    if (progress) {
      progress.completedSteps = [...latest.completedSteps];
      progress.currentStep = latest.currentStep;
      progress.isComplete = latest.isComplete;
      progress.updatedAt = new Date();
    }

    return latest;
  }

  // ──────────────────────────────────────────────────────────────────
  // #354: Deletion helpers
  // ──────────────────────────────────────────────────────────────────

  async remove(id: string): Promise<boolean> {
    this.checkpointsMap.delete(id);
    this.snapshotsMap.delete(id);
    return this.progressMap.delete(id);
  }

  async removeByUserId(userId: string): Promise<number> {
    let removed = 0;
    for (const [id, progress] of this.progressMap) {
      if (progress.userId === userId) {
        this.checkpointsMap.delete(id);
        this.snapshotsMap.delete(id);
        this.progressMap.delete(id);
        removed++;
      }
    }
    return removed;
  }
}
