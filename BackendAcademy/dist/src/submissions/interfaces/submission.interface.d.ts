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
    submittedAt: Date;
    reviewedAt?: Date;
    reviewedBy?: string;
    createdAt: Date;
    updatedAt: Date;
}
