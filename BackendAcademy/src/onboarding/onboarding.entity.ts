import { v4 as uuidv4 } from 'uuid';

export class OnboardingProgress {
  id: string;
  userId: string;
  currentStep: string;
  completedSteps: string[];
  totalSteps: number;
  isComplete: boolean;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
  /**
   * BA-044 — Optimistic-concurrency version. Every durable write increments
   * this counter; updates that supply a stale version are rejected so
   * concurrent devices cannot silently clobber each other's progress.
   */
  version: number;

  constructor(partial: Partial<OnboardingProgress>) {
    Object.assign(this, partial);
    this.id = this.id || uuidv4();
    this.createdAt = this.createdAt || new Date();
    this.updatedAt = this.updatedAt || new Date();
    this.completedSteps = this.completedSteps || [];
    this.totalSteps = this.totalSteps || 0;
    this.isComplete = this.isComplete ?? false;
    this.version = this.version ?? 0;
  }
}
