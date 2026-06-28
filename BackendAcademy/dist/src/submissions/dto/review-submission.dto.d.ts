import { SubmissionStatus } from '../interfaces/submission-status.enum';
export declare class ReviewSubmissionDto {
    status: SubmissionStatus.APPROVED | SubmissionStatus.REJECTED | SubmissionStatus.NEEDS_REVISION;
    feedback?: string;
    score?: number;
}
