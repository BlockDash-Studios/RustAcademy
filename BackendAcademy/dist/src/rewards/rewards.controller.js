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
exports.RewardsController = void 0;
const common_1 = require("@nestjs/common");
const rewards_service_1 = require("./rewards.service");
let RewardsController = class RewardsController {
    constructor(rewardsService) {
        this.rewardsService = rewardsService;
    }
    getAllThresholds() {
        return this.rewardsService.getAllThresholds();
    }
    getLevelThreshold(level) {
        return this.rewardsService.getLevelThreshold(level);
    }
    getUserProgression(userId) {
        return this.rewardsService.getUserProgression(userId);
    }
    getLeaderboard(topN) {
        return this.rewardsService.getLeaderboard(topN);
    }
    getUserLeaderboardPosition(userId) {
        return this.rewardsService.getUserLeaderboardPosition(userId);
    }
    getPrizePool() {
        const pool = this.rewardsService.getPrizePool();
        if (!pool) {
            throw new common_1.NotFoundException('No prize pool has been created yet.');
        }
        return pool;
    }
    createPrizePool(body) {
        return this.rewardsService.createPrizePool(body.totalAmount, body.currency);
    }
    distributePrizes() {
        return this.rewardsService.distributePrizes();
    }
};
exports.RewardsController = RewardsController;
__decorate([
    (0, common_1.Get)('thresholds'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], RewardsController.prototype, "getAllThresholds", null);
__decorate([
    (0, common_1.Get)('thresholds/:level'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('level', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Object)
], RewardsController.prototype, "getLevelThreshold", null);
__decorate([
    (0, common_1.Get)('progression/:userId'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Object)
], RewardsController.prototype, "getUserProgression", null);
__decorate([
    (0, common_1.Get)('leaderboard'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Query)('topN', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Object)
], RewardsController.prototype, "getLeaderboard", null);
__decorate([
    (0, common_1.Get)('leaderboard/:userId'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Object)
], RewardsController.prototype, "getUserLeaderboardPosition", null);
__decorate([
    (0, common_1.Get)('prize-pool'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], RewardsController.prototype, "getPrizePool", null);
__decorate([
    (0, common_1.Post)('prize-pool'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], RewardsController.prototype, "createPrizePool", null);
__decorate([
    (0, common_1.Post)('prize-pool/distribute'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], RewardsController.prototype, "distributePrizes", null);
exports.RewardsController = RewardsController = __decorate([
    (0, common_1.Controller)('rewards'),
    __metadata("design:paramtypes", [rewards_service_1.RewardsService])
], RewardsController);
//# sourceMappingURL=rewards.controller.js.map