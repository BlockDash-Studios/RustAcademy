"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CourseService = void 0;
const common_1 = require("@nestjs/common");
const course_entity_1 = require("./course.entity");
let CourseService = class CourseService {
    constructor() {
        this.courses = new Map();
    }
    async create(dto) {
        const course = new course_entity_1.CourseEntity({
            id: crypto.randomUUID(),
            ...dto,
        });
        this.courses.set(course.id, course);
        return course;
    }
    async findAll() {
        return Array.from(this.courses.values()).filter(c => c.isActive);
    }
    async findByLevel(level) {
        return Array.from(this.courses.values()).filter(c => c.isActive && c.level === level);
    }
    async findById(id) {
        return this.courses.get(id) || null;
    }
    async update(id, dto) {
        const course = this.courses.get(id);
        if (!course)
            return null;
        Object.assign(course, dto, { updatedAt: new Date() });
        return course;
    }
    async remove(id) {
        return this.courses.delete(id);
    }
};
exports.CourseService = CourseService;
exports.CourseService = CourseService = __decorate([
    (0, common_1.Injectable)()
], CourseService);
//# sourceMappingURL=course.service.js.map