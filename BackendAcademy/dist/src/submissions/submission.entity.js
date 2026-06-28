"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubmissionEntity = void 0;
const submission_status_enum_1 = require("./interfaces/submission-status.enum");
class SubmissionEntity {
    constructor(partial) {
        Object.assign(this, partial);
        this.status = this.status || submission_status_enum_1.SubmissionStatus.PENDING;
        this.submittedAt = this.submittedAt || new Date();
        this.createdAt = this.createdAt || new Date();
        this.updatedAt = this.updatedAt || new Date();
    }
}
exports.SubmissionEntity = SubmissionEntity;
//# sourceMappingURL=submission.entity.js.map