"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TutorProfileEntity = void 0;
class TutorProfileEntity {
    constructor(partial) {
        Object.assign(this, partial);
        this.createdAt = this.createdAt || new Date();
        this.updatedAt = this.updatedAt || new Date();
        this.isVerified = this.isVerified ?? false;
        this.availability = this.availability ?? true;
        this.reputationScore = this.reputationScore || 0;
        this.totalRatings = this.totalRatings || 0;
        this.averageRating = this.averageRating || 0;
        this.coursesCreated = this.coursesCreated || 0;
        this.totalEarnings = this.totalEarnings || 0;
        this.specialties = this.specialties || [];
        this.hourlyRate = this.hourlyRate || 0;
    }
}
exports.TutorProfileEntity = TutorProfileEntity;
//# sourceMappingURL=tutor-profile.entity.js.map