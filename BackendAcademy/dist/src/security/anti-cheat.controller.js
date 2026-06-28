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
exports.AntiCheatController = void 0;
const common_1 = require("@nestjs/common");
const anti_cheat_service_1 = require("./anti-cheat.service");
const check_submission_dto_1 = require("./dto/check-submission.dto");
let AntiCheatController = class AntiCheatController {
    constructor(antiCheatService) {
        this.antiCheatService = antiCheatService;
    }
    async check(dto) {
        return this.antiCheatService.analyzeSubmission(dto);
    }
    async checkBatch(dtos) {
        return this.antiCheatService.analyzeSubmissions(dtos);
    }
};
exports.AntiCheatController = AntiCheatController;
__decorate([
    (0, common_1.Post)('check'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [check_submission_dto_1.CheckSubmissionDto]),
    __metadata("design:returntype", Promise)
], AntiCheatController.prototype, "check", null);
__decorate([
    (0, common_1.Post)('check-batch'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array]),
    __metadata("design:returntype", Promise)
], AntiCheatController.prototype, "checkBatch", null);
exports.AntiCheatController = AntiCheatController = __decorate([
    (0, common_1.Controller)('security/anti-cheat'),
    __metadata("design:paramtypes", [anti_cheat_service_1.AntiCheatService])
], AntiCheatController);
//# sourceMappingURL=anti-cheat.controller.js.map