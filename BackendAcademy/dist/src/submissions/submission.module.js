"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubmissionModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_1 = require("../auth/auth.module");
const grading_result_repository_1 = require("./grading-result.repository");
const grading_result_service_1 = require("./grading-result.service");
const submission_controller_1 = require("./submission.controller");
const submission_service_1 = require("./submission.service");
const tutor_review_controller_1 = require("./tutor-review.controller");
const tutor_review_service_1 = require("./tutor-review.service");
let SubmissionModule = class SubmissionModule {
};
exports.SubmissionModule = SubmissionModule;
exports.SubmissionModule = SubmissionModule = __decorate([
    (0, common_1.Module)({
        imports: [auth_module_1.AuthModule],
        controllers: [submission_controller_1.SubmissionController, tutor_review_controller_1.TutorReviewController],
        providers: [submission_service_1.SubmissionService, grading_result_service_1.GradingResultService, grading_result_repository_1.GradingResultRepository],
        exports: [submission_service_1.SubmissionService, grading_result_service_1.GradingResultService, tutor_review_service_1.TutorReviewService],
    })
], SubmissionModule);
//# sourceMappingURL=submission.module.js.map