"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CourseEntity = void 0;
class CourseEntity {
    constructor(partial) {
        Object.assign(this, partial);
        this.createdAt = this.createdAt || new Date();
        this.updatedAt = this.updatedAt || new Date();
        this.isActive = this.isActive ?? true;
        this.prerequisites = this.prerequisites || [];
        this.skills = this.skills || [];
    }
}
exports.CourseEntity = CourseEntity;
//# sourceMappingURL=course.entity.js.map