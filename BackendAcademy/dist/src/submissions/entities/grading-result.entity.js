"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GradingResultEntity = void 0;
const grading_result_status_enum_1 = require("../interfaces/grading-result-status.enum");
class GradingResultEntity {
    constructor(partial) {
        Object.assign(this, partial);
        this.status = this.status ?? grading_result_status_enum_1.GradingResultStatus.FAIL;
        this.score = this.score ?? 0;
        this.maxScore = this.maxScore ?? 100;
        this.feedback = this.feedback ?? '';
        this.gradedAt = this.gradedAt ?? new Date();
        this.createdAt = this.createdAt ?? new Date();
        this.updatedAt = this.updatedAt ?? new Date();
    }
    get percentage() {
        if (this.maxScore === 0)
            return 0;
        return Math.round((this.score / this.maxScore) * 10000) / 100;
    }
    get passed() {
        return this.status === grading_result_status_enum_1.GradingResultStatus.PASS;
    }
}
exports.GradingResultEntity = GradingResultEntity;
//# sourceMappingURL=grading-result.entity.js.map