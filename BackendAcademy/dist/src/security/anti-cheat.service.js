"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var AntiCheatService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AntiCheatService = void 0;
const common_1 = require("@nestjs/common");
let AntiCheatService = AntiCheatService_1 = class AntiCheatService {
    constructor() {
        this.logger = new common_1.Logger(AntiCheatService_1.name);
    }
    async analyzeSubmission(dto) {
        this.logger.log(`[PLACEHOLDER] Analysing submission for learnerId=${dto.learnerId}, taskId=${dto.taskId}`);
        return {
            flagged: false,
            confidence: 0,
            riskLevel: 'low',
            reason: 'AI anti-cheat check not yet implemented — placeholder result returned.',
            recommendedAction: 'none',
        };
    }
    async analyzeSubmissions(dtos) {
        this.logger.log(`[PLACEHOLDER] Batch analysing ${dtos.length} submission(s)`);
        return Promise.all(dtos.map((dto) => this.analyzeSubmission(dto)));
    }
};
exports.AntiCheatService = AntiCheatService;
exports.AntiCheatService = AntiCheatService = AntiCheatService_1 = __decorate([
    (0, common_1.Injectable)()
], AntiCheatService);
//# sourceMappingURL=anti-cheat.service.js.map