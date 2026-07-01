import { SubmissionStatus } from './submission-status.enum';

export interface ISubmission {
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
}
