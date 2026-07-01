import { SubmissionStatus } from './interfaces/submission-status.enum';

export class SubmissionEntity {
  id: string;
  taskId: string;
  userId: string;
  content: string;
  fileUrl?: string;
  status: SubmissionStatus;
  feedback?: string;
  score?: number;
  /** True when this submission is saved as a draft and not yet submitted. */
  isDraft: boolean;
  /** Timestamp of the last time this draft was saved. Null for non-drafts. */
  draftSavedAt?: Date;
  submittedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<SubmissionEntity>) {
    Object.assign(this, partial);
    this.status = this.status || SubmissionStatus.PENDING;
    this.isDraft = this.isDraft ?? false;
    this.submittedAt = this.submittedAt || new Date();
    this.createdAt = this.createdAt || new Date();
    this.updatedAt = this.updatedAt || new Date();
  }
}
