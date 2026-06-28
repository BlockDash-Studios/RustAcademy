"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GradingResultRepository = void 0;
const common_1 = require("@nestjs/common");
let GradingResultRepository = class GradingResultRepository {
    constructor() {
        this.store = new Map();
    }
    async save(entity) {
        this.store.set(entity.id, entity);
        return entity;
    }
    async findById(id) {
        return this.store.get(id) ?? null;
    }
    async findBySubmissionId(submissionId) {
        return Array.from(this.store.values())
            .filter((r) => r.submissionId === submissionId)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }
    async findLatestBySubmissionId(submissionId) {
        const results = await this.findBySubmissionId(submissionId);
        return results.length > 0 ? results[results.length - 1] : null;
    }
    async findByGraderId(graderId) {
        return Array.from(this.store.values())
            .filter((r) => r.graderId === graderId)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    async delete(id) {
        return this.store.delete(id);
    }
};
exports.GradingResultRepository = GradingResultRepository;
exports.GradingResultRepository = GradingResultRepository = __decorate([
    (0, common_1.Injectable)()
], GradingResultRepository);
//# sourceMappingURL=grading-result.repository.js.map