import { Request } from 'express';
import { TutorReviewService, ReviewQueuePage, ReviewStats } from './tutor-review.service';
import { ReviewSubmissionDto } from './dto/review-submission.dto';
import { ReviewQueueQueryDto } from './dto/review-queue-query.dto';
import { TutorJwtPayload } from '../auth/guards/jwt-tutor.guard';
type AuthedRequest = Request & {
    tutor: TutorJwtPayload;
};
export declare class TutorReviewController {
    private readonly tutorReviewService;
    constructor(tutorReviewService: TutorReviewService);
    getPendingQueue(query: ReviewQueueQueryDto): Promise<ReviewQueuePage>;
    getNeedsRevisionQueue(query: ReviewQueueQueryDto): Promise<ReviewQueuePage>;
    getStats(taskId?: string): Promise<ReviewStats>;
    getReviewHistory(req: AuthedRequest, query: ReviewQueueQueryDto): Promise<ReviewQueuePage>;
    reviewSubmission(id: string, req: AuthedRequest, dto: ReviewSubmissionDto): Promise<import("./submission.entity").SubmissionEntity>;
}
export {};
