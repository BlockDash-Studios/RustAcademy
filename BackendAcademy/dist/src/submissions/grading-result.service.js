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
exports.GradingResultService = void 0;
const common_1 = require("@nestjs/common");
const grading_result_repository_1 = require("./grading-result.repository");
const submission_service_1 = require("./submission.service");
const grading_result_entity_1 = require("./entities/grading-result.entity");
const submission_status_enum_1 = require("./interfaces/submission-status.enum");
const grading_result_status_enum_1 = require("./interfaces/grading-result-status.enum");
let GradingResultService = class GradingResultService {
    constructor(gradingResultRepo, submissionService) {
        this.gradingResultRepo = gradingResultRepo;
        this.submissionService = submissionService;
    }
    async saveResult(submissionId, dto) {
        const submission = await this.submissionService.findById(submissionId);
        if (!submission) {
            throw new common_1.NotFoundException(`Submission ${submissionId} not found`);
        }
        if (dto.maxScore <= 0) {
            throw new common_1.BadRequestException('maxScore must be greater than 0');
        }
        if (dto.score < 0 || dto.score > dto.maxScore) {
            throw new common_1.BadRequestException(`score must be between 0 and maxScore (${dto.maxScore})`);
        }
        const entity = new grading_result_entity_1.GradingResultEntity({
            id: crypto.randomUUID(),
            submissionId,
            graderId: dto.graderId,
            status: dto.status,
            score: dto.score,
            maxScore: dto.maxScore,
            feedback: dto.feedback,
            privateNotes: dto.privateNotes,
            rubric: dto.rubric,
        });
        const saved = await this.gradingResultRepo.save(entity);
        const submissionStatus = this.toSubmissionStatus(dto.status);
        await this.submissionService.review(submissionId, dto.graderId, submissionStatus, dto.feedback, dto.score);
        return saved;
    }
    async getResultsBySubmission(submissionId) {
        const submission = await this.submissionService.findById(submissionId);
        if (!submission) {
            throw new common_1.NotFoundException(`Submission ${submissionId} not found`);
        }
        return this.gradingResultRepo.findBySubmissionId(submissionId);
    }
    async getLatestResult(submissionId) {
        const submission = await this.submissionService.findById(submissionId);
        if (!submission) {
            throw new common_1.NotFoundException(`Submission ${submissionId} not found`);
        }
        return this.gradingResultRepo.findLatestBySubmissionId(submissionId);
    }
    async getResultById(id) {
        const result = await this.gradingResultRepo.findById(id);
        if (!result) {
            throw new common_1.NotFoundException(`Grading result ${id} not found`);
        }
        return result;
    }
    async getResultsByGrader(graderId) {
        return this.gradingResultRepo.findByGraderId(graderId);
    }
    async deleteResult(id) {
        const deleted = await this.gradingResultRepo.delete(id);
        if (!deleted) {
            throw new common_1.NotFoundException(`Grading result ${id} not found`);
        }
    }
    toSubmissionStatus(gradingStatus) {
        switch (gradingStatus) {
            case grading_result_status_enum_1.GradingResultStatus.PASS:
                return submission_status_enum_1.SubmissionStatus.APPROVED;
            case grading_result_status_enum_1.GradingResultStatus.FAIL:
                return submission_status_enum_1.SubmissionStatus.REJECTED;
            case grading_result_status_enum_1.GradingResultStatus.NEEDS_REVISION:
                return submission_status_enum_1.SubmissionStatus.NEEDS_REVISION;
            case grading_result_status_enum_1.GradingResultStatus.PARTIAL:
                return submission_status_enum_1.SubmissionStatus.NEEDS_REVISION;
        }
    }
};
exports.GradingResultService = GradingResultService;
exports.GradingResultService = GradingResultService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [grading_result_repository_1.GradingResultRepository,
        submission_service_1.SubmissionService])
], GradingResultService);
//# sourceMappingURL=grading-result.service.js.map