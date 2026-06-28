"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserProfileEntity = void 0;
class UserProfileEntity {
    constructor(partial) {
        Object.assign(this, partial);
        this.skills = this.skills || [];
        this.createdAt = this.createdAt || new Date();
        this.updatedAt = this.updatedAt || new Date();
    }
}
exports.UserProfileEntity = UserProfileEntity;
//# sourceMappingURL=user-profile.entity.js.map