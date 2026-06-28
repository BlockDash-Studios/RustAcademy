"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserProfileService = void 0;
const common_1 = require("@nestjs/common");
const user_profile_entity_1 = require("./user-profile.entity");
let UserProfileService = class UserProfileService {
    constructor() {
        this.profiles = new Map();
    }
    async create(profile) {
        const entity = new user_profile_entity_1.UserProfileEntity({
            id: crypto.randomUUID(),
            ...profile,
        });
        this.profiles.set(entity.id, entity);
        return entity;
    }
    async findAll() {
        return Array.from(this.profiles.values());
    }
    async findById(id) {
        return this.profiles.get(id) || null;
    }
    async findByUserId(userId) {
        return Array.from(this.profiles.values()).find(p => p.userId === userId) || null;
    }
    async update(id, updates) {
        const profile = this.profiles.get(id);
        if (!profile)
            return null;
        Object.assign(profile, updates, { updatedAt: new Date() });
        return profile;
    }
    async remove(id) {
        return this.profiles.delete(id);
    }
};
exports.UserProfileService = UserProfileService;
exports.UserProfileService = UserProfileService = __decorate([
    (0, common_1.Injectable)()
], UserProfileService);
//# sourceMappingURL=user-profile.service.js.map