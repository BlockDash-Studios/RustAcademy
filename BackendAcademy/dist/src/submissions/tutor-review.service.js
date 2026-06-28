"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TutorReviewService = void 0;
const common_1 = require("@nestjs/common");
const submission_service_1 = require("./submission.service");
const submission_status_enum_1 = require("./interfaces/submission-status.enum");
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;
let TutorReviewService = class TutorReviewService {
    constructor(submissionService) {
        this.submissionService = submissionService;
    }
    async getPendingQueue(query) {
        const limit = Math.min(Math.max(1, Number(query.limit) || DEFAULT_PAGE_LIMIT), MAX_PAGE_LIMIT);
        let items = await this.submissionService.findByStatus(submission_status_enum_1.SubmissionStatus.PENDING);
        if (query.taskId) {
            items = items.filter(s => s.taskId === query.taskId);
        }
        items.sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
        if (query.cursor) {
            const cursorIndex = items.findIndex(s => s.id === query.cursor);
            if (cursorIndex !== -1) {
                items = items.slice(cursorIndex + 1);
            }
        }
        const total = items.length;
        const page = items.slice(0, limit);
        const nextCursor = page.length === limit && total > limit ? page[page.length - 1].id : null;
        return { items: page, total, nextCursor };
    }
    async getNeedsRevisionQueue(query) {
        const limit = Math.min(Math.max(1, Number(query.limit) || DEFAULT_PAGE_LIMIT), MAX_PAGE_LIMIT);
        let items = await this.submissionService.findByStatus(submission_status_enum_1.SubmissionStatus.NEEDS_REVISION);
        if (query.taskId) {
            items = items.filter(s => s.taskId === query.taskId);
        }
        items.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
        if (query.cursor) {
            const cursorIndex = items.findIndex(s => s.id === query.cursor);
            if (cursorIndex !== -1) {
                items = items.slice(cursorIndex + 1);
            }
        }
        const total = items.length;
        const page = items.slice(0, limit);
        const nextCursor = page.length === limit && total > limit ? page[page.length - 1].id : null;
        return { items: page, total, nextCursor };
    }
    async reviewSubmission(submissionId, tutorId, dto) {
        const submission = await this.submissionService.findById(submissionId);
        if (!submission) {
            throw new common_1.NotFoundException({
                error: 'SUBMISSION_NOT_FOUND',
                message: `Submission ${submissionId} does not exist`,
            });
        }
        const reviewableStatuses = [
            submission_status_enum_1.SubmissionStatus.PENDING,
            submission_status_enum_1.SubmissionStatus.NEEDS_REVISION,
        ];
        if (!reviewableStatuses.includes(submission.status)) {
            throw new common_1.BadRequestException({
                error: 'SUBMISSION_NOT_REVIEWABLE',
                message: `Submission is already in "${submission.status}" state and cannot be reviewed again`,
            });
        }
        if (dto.score !== undefined && (dto.score < 0 || dto.score > 100)) {
            throw new common_1.BadRequestException({
                error: 'INVALID_SCORE',
                message: 'Score must be between 0 and 100',
            });
        }
        return this.submissionService.review(submissionId, tutorId, dto.status, dto.feedback, dto.score);
    }
    async getStats(taskId) {
        let all = await this.submissionService.findAll();
        if (taskId) {
            all = all.filter(s => s.taskId === taskId);
        }
        return {
            pending: all.filter(s => s.status === submission_status_enum_1.SubmissionStatus.PENDING).length,
            approved: all.filter(s => s.status === submission_status_enum_1.SubmissionStatus.APPROVED).length,
            rejected: all.filter(s => s.status === submission_status_enum_1.SubmissionStatus.REJECTED).length,
            needs_revision: all.filter(s => s.status === submission_status_enum_1.SubmissionStatus.NEEDS_REVISION).length,
            total: all.length,
        };
    }
    async getReviewedByTutor(tutorId, query) {
        const limit = Math.min(Math.max(1, Number(query.limit) || DEFAULT_PAGE_LIMIT), MAX_PAGE_LIMIT);
        let items = (await this.submissionService.findAll()).filter(s => s.reviewedBy === tutorId);
        if (query.taskId) {
            items = items.filter(s => s.taskId === query.taskId);
        }
        items.sort((a, b) => (b.reviewedAt?.getTime() ?? 0) - (a.reviewedAt?.getTime() ?? 0));
        if (query.cursor) {
            const cursorIndex = items.findIndex(s => s.id === query.cursor);
            if (cursorIndex !== -1) {
                items = items.slice(cursorIndex + 1);
            }
        }
        const total = items.length;
        const page = items.slice(0, limit);
        const nextCursor = page.length === limit && total > limit ? page[page.length - 1].id : null;
        return { items: page, total, nextCursor };
    }
};
exports.TutorReviewService = TutorReviewService;
exports.TutorReviewService = TutorReviewService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [submission_service_1.SubmissionService])
], TutorReviewService);
//# sourceMappingURL=tutor-review.service.js.map