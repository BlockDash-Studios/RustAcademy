import { SubmissionStatus } from './interfaces/submission-status.enum';
export declare class SubmissionEntity {
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
    constructor(partial: Partial<SubmissionEntity>);
}
