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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubmissionController = void 0;
const common_1 = require("@nestjs/common");
const submission_service_1 = require("./submission.service");
const grading_result_service_1 = require("./grading-result.service");
const create_submission_dto_1 = require("./dto/create-submission.dto");
const update_submission_dto_1 = require("./dto/update-submission.dto");
const save_grading_result_dto_1 = require("./dto/save-grading-result.dto");
const submission_status_enum_1 = require("./interfaces/submission-status.enum");
let SubmissionController = class SubmissionController {
    constructor(submissionService, gradingResultService) {
        this.submissionService = submissionService;
        this.gradingResultService = gradingResultService;
    }
    async create(dto) {
        return this.submissionService.create(dto);
    }
    async findAll() {
        return this.submissionService.findAll();
    }
    async findByTaskId(taskId) {
        return this.submissionService.findByTaskId(taskId);
    }
    async findByUserId(userId) {
        return this.submissionService.findByUserId(userId);
    }
    async findByStatus(status) {
        return this.submissionService.findByStatus(status);
    }
    async findById(id) {
        return this.submissionService.findById(id);
    }
    async update(id, dto) {
        return this.submissionService.update(id, dto);
    }
    async review(id, reviewerId, status, feedback, score) {
        return this.submissionService.review(id, reviewerId, status, feedback, score);
    }
    async remove(id) {
        return this.submissionService.remove(id);
    }
    async saveGradingResult(id, dto) {
        return this.gradingResultService.saveResult(id, dto);
    }
    async getGradingResults(id) {
        return this.gradingResultService.getResultsBySubmission(id);
    }
    async getLatestGradingResult(id) {
        return this.gradingResultService.getLatestResult(id);
    }
    async getGradingResultById(gradeId) {
        return this.gradingResultService.getResultById(gradeId);
    }
    async deleteGradingResult(gradeId) {
        await this.gradingResultService.deleteResult(gradeId);
    }
};
exports.SubmissionController = SubmissionController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_submission_dto_1.CreateSubmissionDto]),
    __metadata("design:returntype", Promise)
], SubmissionController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SubmissionController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('task/:taskId'),
    __param(0, (0, common_1.Param)('taskId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SubmissionController.prototype, "findByTaskId", null);
__decorate([
    (0, common_1.Get)('user/:userId'),
    __param(0, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SubmissionController.prototype, "findByUserId", null);
__decorate([
    (0, common_1.Get)('status/:status'),
    __param(0, (0, common_1.Param)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SubmissionController.prototype, "findByStatus", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SubmissionController.prototype, "findById", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_submission_dto_1.UpdateSubmissionDto]),
    __metadata("design:returntype", Promise)
], SubmissionController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/review'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)('reviewedBy')),
    __param(2, (0, common_1.Body)('status')),
    __param(3, (0, common_1.Body)('feedback')),
    __param(4, (0, common_1.Body)('score')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, Number]),
    __metadata("design:returntype", Promise)
], SubmissionController.prototype, "review", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SubmissionController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':id/grade'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, save_grading_result_dto_1.SaveGradingResultDto]),
    __metadata("design:returntype", Promise)
], SubmissionController.prototype, "saveGradingResult", null);
__decorate([
    (0, common_1.Get)(':id/grades'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SubmissionController.prototype, "getGradingResults", null);
__decorate([
    (0, common_1.Get)(':id/grades/latest'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SubmissionController.prototype, "getLatestGradingResult", null);
__decorate([
    (0, common_1.Get)('grades/:gradeId'),
    __param(0, (0, common_1.Param)('gradeId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SubmissionController.prototype, "getGradingResultById", null);
__decorate([
    (0, common_1.Delete)('grades/:gradeId'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    __param(0, (0, common_1.Param)('gradeId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SubmissionController.prototype, "deleteGradingResult", null);
exports.SubmissionController = SubmissionController = __decorate([
    (0, common_1.Controller)('submissions'),
    __metadata("design:paramtypes", [submission_service_1.SubmissionService,
        grading_result_service_1.GradingResultService])
], SubmissionController);
//# sourceMappingURL=submission.controller.js.map