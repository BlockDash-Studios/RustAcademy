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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TutorReviewController = void 0;
const common_1 = require("@nestjs/common");
const tutor_review_service_1 = require("./tutor-review.service");
const review_submission_dto_1 = require("./dto/review-submission.dto");
const review_queue_query_dto_1 = require("./dto/review-queue-query.dto");
const jwt_tutor_guard_1 = require("../auth/guards/jwt-tutor.guard");
let TutorReviewController = class TutorReviewController {
    constructor(tutorReviewService) {
        this.tutorReviewService = tutorReviewService;
    }
    async getPendingQueue(query) {
        return this.tutorReviewService.getPendingQueue(query);
    }
    async getNeedsRevisionQueue(query) {
        return this.tutorReviewService.getNeedsRevisionQueue(query);
    }
    async getStats(taskId) {
        return this.tutorReviewService.getStats(taskId);
    }
    async getReviewHistory(req, query) {
        return this.tutorReviewService.getReviewedByTutor(req.tutor.sub, query);
    }
    async reviewSubmission(id, req, dto) {
        return this.tutorReviewService.reviewSubmission(id, req.tutor.sub, dto);
    }
};
exports.TutorReviewController = TutorReviewController;
__decorate([
    (0, common_1.Get)('queue/pending'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [review_queue_query_dto_1.ReviewQueueQueryDto]),
    __metadata("design:returntype", Promise)
], TutorReviewController.prototype, "getPendingQueue", null);
__decorate([
    (0, common_1.Get)('queue/needs-revision'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [review_queue_query_dto_1.ReviewQueueQueryDto]),
    __metadata("design:returntype", Promise)
], TutorReviewController.prototype, "getNeedsRevisionQueue", null);
__decorate([
    (0, common_1.Get)('stats'),
    __param(0, (0, common_1.Query)('taskId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TutorReviewController.prototype, "getStats", null);
__decorate([
    (0, common_1.Get)('history'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_a = typeof AuthedRequest !== "undefined" && AuthedRequest) === "function" ? _a : Object, review_queue_query_dto_1.ReviewQueueQueryDto]),
    __metadata("design:returntype", Promise)
], TutorReviewController.prototype, "getReviewHistory", null);
__decorate([
    (0, common_1.Post)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_b = typeof AuthedRequest !== "undefined" && AuthedRequest) === "function" ? _b : Object, review_submission_dto_1.ReviewSubmissionDto]),
    __metadata("design:returntype", Promise)
], TutorReviewController.prototype, "reviewSubmission", null);
exports.TutorReviewController = TutorReviewController = __decorate([
    (0, common_1.UseGuards)(jwt_tutor_guard_1.JwtTutorGuard),
    (0, common_1.Controller)('tutor/review'),
    __metadata("design:paramtypes", [tutor_review_service_1.TutorReviewService])
], TutorReviewController);
//# sourceMappingURL=tutor-review.controller.js.map