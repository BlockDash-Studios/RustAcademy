import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { OnboardingProgress } from './onboarding.entity';
import { CreateOnboardingProgressDto } from './dto/create-onboarding-progress.dto';
import { UpdateOnboardingProgressDto } from './dto/update-onboarding-progress.dto';

/**
 * BA-044 — Thrown when an update carries a stale version number. Signals an
 * optimistic-concurrency conflict between concurrent devices; the caller
 * should re-read the latest progress and retry (or prompt the user to merge).
 */
export class VersionConflictError extends ConflictException {
  constructor(progressId: string, expectedVersion: number, actualVersion: number) {
    super({
      statusCode: 409,
      error: 'VERSION_CONFLICT',
      message:
        `Onboarding progress ${progressId} has version ${actualVersion}, ` +
        `but update was based on version ${expectedVersion}`,
      progressId,
      expectedVersion,
      actualVersion,
    });
  }
}

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

  /**
   * BA-044 — Durable, idempotent, conflict-aware update.
   *
   * When `expectedVersion` is supplied, the write is rejected with a
   * `VersionConflictError` if the stored version differs, so two devices
   * editing the same progress cannot silently clobber each other. When the
   * incoming state is identical to the stored state, the update is a safe
   * no-op (idempotent) and does not increment the version.
   */
  async update(
    id: string,
    dto: UpdateOnboardingProgressDto & { expectedVersion?: number },
  ): Promise<OnboardingProgress | null> {
    const progress = this.progressMap.get(id);
    if (!progress) return null;

    // Optimistic concurrency: reject stale writes.
    if (dto.expectedVersion !== undefined) {
      if (dto.expectedVersion !== progress.version) {
        throw new VersionConflictError(id, dto.expectedVersion, progress.version);
      }
    }

    // Idempotency: if nothing observable changes, return the record unchanged.
    const appliedStep = dto.completedSteps;
    const alreadyApplied =
      appliedStep === undefined ||
      appliedStep.length === progress.completedSteps.length &&
        appliedStep.every((s) => progress.completedSteps.includes(s));

    const unchangedCurrentStep =
      dto.currentStep === undefined || dto.currentStep === progress.currentStep;

    if (
      alreadyApplied &&
      unchangedCurrentStep &&
      dto.isComplete === undefined &&
      dto.metadata === undefined
    ) {
      return progress;
    }

    // Merge completedSteps set-wise so a partial/duplicate update can't
    // erase previously recorded steps.
    if (dto.completedSteps !== undefined) {
      const merged = new Set([
        ...progress.completedSteps,
        ...dto.completedSteps,
      ]);
      progress.completedSteps = Array.from(merged);
    }
    if (dto.currentStep !== undefined) {
      progress.currentStep = dto.currentStep;
    }
    if (dto.isComplete !== undefined) {
      progress.isComplete = dto.isComplete;
      if (dto.isComplete) progress.completedAt = new Date();
    }
    if (dto.metadata !== undefined) {
      progress.metadata = { ...progress.metadata, ...dto.metadata };
    }
    progress.updatedAt = new Date();
    progress.version += 1;
    return progress;
  }

  /**
   * BA-044 — Idempotent, versioned step completion.
   *
   * Completing an already-completed step is a no-op (it is not added twice).
   * A checkpoint is recorded and the optimistic-concurrency version advances
   * on every durable change.
   */
  async completeStep(
    id: string,
    step: string,
    options?: { expectedVersion?: number },
  ): Promise<OnboardingProgress> {
    const progress = this.progressMap.get(id);
    if (!progress)
      throw new NotFoundException('Onboarding progress not found');

    // Optimistic concurrency: reject stale writes for concurrent devices.
    if (options?.expectedVersion !== undefined) {
      if (options.expectedVersion !== progress.version) {
        throw new VersionConflictError(id, options.expectedVersion, progress.version);
      }
    }

    const isAlreadyDone = progress.completedSteps.includes(step);

    // Idempotent: re-completing an already-done step advances nothing.
    if (isAlreadyDone && progress.currentStep === step) {
      const alreadyComplete =
        progress.totalSteps > 0 &&
        progress.completedSteps.length >= progress.totalSteps;
      if (alreadyComplete === progress.isComplete) {
        return progress;
      }
    }

    if (!isAlreadyDone) {
      progress.completedSteps.push(step);
    }
    progress.currentStep = step;
    progress.updatedAt = new Date();

    // #355: Record a checkpoint for this step completion (idempotently).
    const checkpoints = this.checkpointsMap.get(id) ?? [];
    if (!checkpoints.some((c) => c.stepName === step)) {
      this.recordCheckpoint(id, step);
    }

    if (
      progress.totalSteps > 0 &&
      progress.completedSteps.length >= progress.totalSteps
    ) {
      progress.isComplete = true;
      progress.completedAt = new Date();
    }

    progress.version += 1;
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

  // ──────────────────────────────────────────────────────────────────
  // BA-044: Durable persistence & conflict-aware recovery
  // ──────────────────────────────────────────────────────────────────

  /**
   * Serialises the entire onboarding state into a JSON-safe plain object.
   * Consumers (e.g. a repository / DB adapter) can persist this and reload
   * it via `importState()` so progress survives process restarts and is
   * shared across devices.
   */
  exportState(): {
    progress: Array<Record<string, unknown>>;
    checkpoints: Array<{ progressId: string; checkpoints: OnboardingCheckpoint[] }>;
  } {
    return {
      progress: Array.from(this.progressMap.values()).map((p) => ({
        id: p.id,
        userId: p.userId,
        currentStep: p.currentStep,
        completedSteps: [...p.completedSteps],
        totalSteps: p.totalSteps,
        isComplete: p.isComplete,
        completedAt: p.completedAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        metadata: p.metadata,
        version: p.version,
      })),
      checkpoints: Array.from(this.checkpointsMap.entries()).map(
        ([progressId, items]) => ({
          progressId,
          checkpoints: items.map((c) => ({
            stepName: c.stepName,
            completedAt: c.completedAt,
            metadata: c.metadata,
          })),
        }),
      ),
    };
  }

  /**
   * Restores previously exported state. This is what a durable store calls
   * on startup to reload progress that survived a restart.
   */
  importState(
    state: ReturnType<OnboardingService['exportState']>,
  ): number {
    this.progressMap.clear();
    this.checkpointsMap.clear();
    this.snapshotsMap.clear();

    const parsed: OnboardingProgress[] = state.progress.map((raw) => {
      const record = new OnboardingProgress({
        id: raw.id as string,
        userId: raw.userId as string,
        currentStep: raw.currentStep as string,
        completedSteps: raw.completedSteps as string[],
        totalSteps: raw.totalSteps as number,
        isComplete: raw.isComplete as boolean,
        completedAt: (raw.completedAt as string | null)
          ? new Date(raw.completedAt as string)
          : undefined,
        createdAt: new Date(raw.createdAt as string),
        updatedAt: new Date(raw.updatedAt as string),
        metadata: raw.metadata as Record<string, any>,
        version: raw.version as number,
      });
      return record;
    });

    for (const record of parsed) {
      this.progressMap.set(record.id, record);
      this.checkpointsMap.set(record.id, []);
      this.snapshotsMap.set(record.id, []);
    }

    for (const group of state.checkpoints) {
      this.checkpointsMap.set(
        group.progressId,
        group.checkpoints.map((c) => ({
          stepName: c.stepName,
          completedAt:
            c.completedAt instanceof Date
              ? c.completedAt
              : new Date(c.completedAt as unknown as string),
          metadata: c.metadata,
        })),
      );
    }

    return parsed.length;
  }

  /**
   * Clears all in-memory state. Useful for test isolation and for a
   * durable store to perform a full reset.
   */
  clearAll(): void {
    this.progressMap.clear();
    this.checkpointsMap.clear();
    this.snapshotsMap.clear();
  }

  /**
   * Returns the number of progress records currently held.
   */
  count(): number {
    return this.progressMap.size;
  }
}
