"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubmissionsService = void 0;
const common_1 = require("@nestjs/common");
let SubmissionsService = class SubmissionsService {
    constructor() {
        this.submissions = [];
    }
    findAll() {
        return this.submissions.map((submission) => submission.id);
    }
    findOne(id) {
        const submission = this.submissions.find((item) => item.id === id);
        return submission ? JSON.stringify(submission) : 'Submission not found';
    }
    create(payload) {
        const submission = {
            id: `${Date.now()}`,
            ...payload,
        };
        this.submissions.push(submission);
        return JSON.stringify(submission);
    }
};
exports.SubmissionsService = SubmissionsService;
exports.SubmissionsService = SubmissionsService = __decorate([
    (0, common_1.Injectable)()
], SubmissionsService);
//# sourceMappingURL=submissions.service.js.map