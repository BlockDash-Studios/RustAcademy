"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BadgesService = void 0;
const common_1 = require("@nestjs/common");
const badgeDefinitions = {
    'first-login': {
        id: 'first-login',
        name: 'First Steps',
        description: 'Log in for the first time.',
        iconUrl: 'https://api.dicebear.com/7.x/identicon/svg?seed=first-login',
    },
    'ten-submissions': {
        id: 'ten-submissions',
        name: 'Dedicated Learner',
        description: 'Complete 10 course submissions.',
        iconUrl: 'https://api.dicebear.com/7.x/identicon/svg?seed=ten-submissions',
    },
    'streak-seven': {
        id: 'streak-seven',
        name: 'Week Warrior',
        description: 'Maintain a 7-day activity streak.',
        iconUrl: 'https://api.dicebear.com/7.x/identicon/svg?seed=streak-seven',
    },
};
const userBadgesStore = new Map();
let BadgesService = class BadgesService {
    getAllBadges() {
        return {
            badges: Object.values(badgeDefinitions),
        };
    }
    getUserBadges(userId) {
        const badges = userBadgesStore.get(userId) ?? [];
        return {
            userId,
            badges,
        };
    }
    awardBadge(userId, badgeId, nftTokenId) {
        const badge = badgeDefinitions[badgeId];
        if (!badge) {
            throw new common_1.NotFoundException(`Badge '${badgeId}' not found.`);
        }
        const currentBadges = userBadgesStore.get(userId) ?? [];
        if (currentBadges.some((ub) => ub.badge.id === badgeId)) {
            return this.getUserBadges(userId);
        }
        const newUserBadge = {
            badge,
            awardedAt: new Date().toISOString(),
            nftTokenId,
        };
        userBadgesStore.set(userId, [...currentBadges, newUserBadge]);
        return this.getUserBadges(userId);
    }
    resetUserBadges(userId) {
        userBadgesStore.delete(userId);
    }
};
exports.BadgesService = BadgesService;
exports.BadgesService = BadgesService = __decorate([
    (0, common_1.Injectable)()
], BadgesService);
//# sourceMappingURL=badges.service.js.map