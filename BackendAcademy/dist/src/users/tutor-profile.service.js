"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TutorProfileService = void 0;
const common_1 = require("@nestjs/common");
const tutor_profile_entity_1 = require("./tutor-profile.entity");
let TutorProfileService = class TutorProfileService {
    constructor() {
        this.profiles = new Map();
    }
    async create(dto) {
        const profile = new tutor_profile_entity_1.TutorProfileEntity({
            id: crypto.randomUUID(),
            ...dto,
        });
        this.profiles.set(profile.id, profile);
        return profile;
    }
    async findAll() {
        return Array.from(this.profiles.values());
    }
    async findById(id) {
        return this.profiles.get(id) || null;
    }
    async findByUserId(userId) {
        return (Array.from(this.profiles.values()).find(p => p.userId === userId) || null);
    }
    async findBySpecialty(specialty) {
        return Array.from(this.profiles.values()).filter(p => p.specialties.includes(specialty));
    }
    async update(id, dto) {
        const profile = this.profiles.get(id);
        if (!profile)
            return null;
        Object.assign(profile, dto, { updatedAt: new Date() });
        return profile;
    }
    async rate(id, dto) {
        const profile = this.profiles.get(id);
        if (!profile)
            throw new common_1.NotFoundException('Tutor profile not found');
        const total = profile.totalRatings * profile.averageRating + dto.rating;
        profile.totalRatings += 1;
        profile.averageRating = total / profile.totalRatings;
        profile.updatedAt = new Date();
        return profile;
    }
    async incrementCoursesCreated(id) {
        const profile = this.profiles.get(id);
        if (profile) {
            profile.coursesCreated += 1;
            profile.updatedAt = new Date();
        }
    }
    async updateEarnings(id, amount) {
        const profile = this.profiles.get(id);
        if (profile) {
            profile.totalEarnings += amount;
            profile.updatedAt = new Date();
        }
    }
    async getEarningsSummary(id) {
        const profile = this.profiles.get(id);
        if (!profile) {
            throw new common_1.NotFoundException('Tutor profile not found');
        }
        return {
            tutorId: profile.id,
            earnedXlm: profile.totalEarnings,
            totalPaidOut: 0,
            pendingPayouts: 0,
            payouts: [],
        };
    }
    async remove(id) {
        return this.profiles.delete(id);
    }
};
exports.TutorProfileService = TutorProfileService;
exports.TutorProfileService = TutorProfileService = __decorate([
    (0, common_1.Injectable)()
], TutorProfileService);
//# sourceMappingURL=tutor-profile.service.js.map