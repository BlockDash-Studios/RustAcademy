"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubmissionService = void 0;
const common_1 = require("@nestjs/common");
const submission_entity_1 = require("./submission.entity");
const submission_status_enum_1 = require("./interfaces/submission-status.enum");
let SubmissionService = class SubmissionService {
    constructor() {
        this.submissions = new Map();
    }
    async create(dto) {
        const submission = new submission_entity_1.SubmissionEntity({
            id: crypto.randomUUID(),
            ...dto,
        });
        this.submissions.set(submission.id, submission);
        return submission;
    }
    async findAll() {
        return Array.from(this.submissions.values());
    }
    async findById(id) {
        return this.submissions.get(id) || null;
    }
    async findByTaskId(taskId) {
        return Array.from(this.submissions.values()).filter(s => s.taskId === taskId);
    }
    async findByUserId(userId) {
        return Array.from(this.submissions.values()).filter(s => s.userId === userId);
    }
    async findByStatus(status) {
        return Array.from(this.submissions.values()).filter(s => s.status === status);
    }
    async update(id, dto) {
        const submission = this.submissions.get(id);
        if (!submission)
            return null;
        Object.assign(submission, dto, { updatedAt: new Date() });
        if (dto.status === submission_status_enum_1.SubmissionStatus.APPROVED || dto.status === submission_status_enum_1.SubmissionStatus.REJECTED) {
            submission.reviewedAt = submission.reviewedAt || new Date();
        }
        return submission;
    }
    async review(id, reviewerId, status, feedback, score) {
        const submission = this.submissions.get(id);
        if (!submission)
            throw new common_1.NotFoundException('Submission not found');
        submission.status = status;
        submission.reviewedBy = reviewerId;
        submission.reviewedAt = new Date();
        submission.updatedAt = new Date();
        if (feedback !== undefined)
            submission.feedback = feedback;
        if (score !== undefined)
            submission.score = score;
        return submission;
    }
    async remove(id) {
        return this.submissions.delete(id);
    }
};
exports.SubmissionService = SubmissionService;
exports.SubmissionService = SubmissionService = __decorate([
    (0, common_1.Injectable)()
], SubmissionService);
//# sourceMappingURL=submission.service.js.map