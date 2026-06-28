import { SubmissionService } from './submission.service';
import { SubmissionEntity } from './submission.entity';
import { ReviewSubmissionDto } from './dto/review-submission.dto';
import { ReviewQueueQueryDto } from './dto/review-queue-query.dto';
export interface ReviewQueuePage {
    items: SubmissionEntity[];
    total: number;
    nextCursor: string | null;
}
export interface ReviewStats {
    pending: number;
    approved: number;
    rejected: number;
    needs_revision: number;
    total: number;
}
export declare class TutorReviewService {
    private readonly submissionService;
    constructor(submissionService: SubmissionService);
    getPendingQueue(query: ReviewQueueQueryDto): Promise<ReviewQueuePage>;
    getNeedsRevisionQueue(query: ReviewQueueQueryDto): Promise<ReviewQueuePage>;
    reviewSubmission(submissionId: string, tutorId: string, dto: ReviewSubmissionDto): Promise<SubmissionEntity>;
    getStats(taskId?: string): Promise<ReviewStats>;
    getReviewedByTutor(tutorId: string, query: ReviewQueueQueryDto): Promise<ReviewQueuePage>;
}
