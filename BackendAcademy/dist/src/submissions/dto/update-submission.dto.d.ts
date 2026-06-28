import { SubmissionStatus } from '../interfaces/submission-status.enum';
export declare class UpdateSubmissionDto {
    content?: string;
    fileUrl?: string;
    status?: SubmissionStatus;
    feedback?: string;
    score?: number;
    reviewedBy?: string;
}
