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
exports.TutorProfileController = void 0;
const common_1 = require("@nestjs/common");
const tutor_profile_service_1 = require("./tutor-profile.service");
const create_tutor_profile_dto_1 = require("./dto/create-tutor-profile.dto");
const update_tutor_profile_dto_1 = require("./dto/update-tutor-profile.dto");
const rate_tutor_dto_1 = require("./dto/rate-tutor.dto");
let TutorProfileController = class TutorProfileController {
    constructor(tutorService) {
        this.tutorService = tutorService;
    }
    async create(dto) {
        return this.tutorService.create(dto);
    }
    async findAll() {
        return this.tutorService.findAll();
    }
    async findByUserId(userId) {
        return this.tutorService.findByUserId(userId);
    }
    async findBySpecialty(specialty) {
        return this.tutorService.findBySpecialty(specialty);
    }
    async findById(id) {
        return this.tutorService.findById(id);
    }
    async getEarningsSummary(id) {
        return this.tutorService.getEarningsSummary(id);
    }
    async update(id, dto) {
        return this.tutorService.update(id, dto);
    }
    async rate(id, dto) {
        return this.tutorService.rate(id, dto);
    }
    async remove(id) {
        return this.tutorService.remove(id);
    }
};
exports.TutorProfileController = TutorProfileController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_tutor_profile_dto_1.CreateTutorProfileDto]),
    __metadata("design:returntype", Promise)
], TutorProfileController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TutorProfileController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('user/:userId'),
    __param(0, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TutorProfileController.prototype, "findByUserId", null);
__decorate([
    (0, common_1.Get)('specialty/:specialty'),
    __param(0, (0, common_1.Param)('specialty')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TutorProfileController.prototype, "findBySpecialty", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TutorProfileController.prototype, "findById", null);
__decorate([
    (0, common_1.Get)(':id/earnings'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TutorProfileController.prototype, "getEarningsSummary", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_tutor_profile_dto_1.UpdateTutorProfileDto]),
    __metadata("design:returntype", Promise)
], TutorProfileController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/rate'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, rate_tutor_dto_1.RateTutorDto]),
    __metadata("design:returntype", Promise)
], TutorProfileController.prototype, "rate", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TutorProfileController.prototype, "remove", null);
exports.TutorProfileController = TutorProfileController = __decorate([
    (0, common_1.Controller)('tutors'),
    __metadata("design:paramtypes", [tutor_profile_service_1.TutorProfileService])
], TutorProfileController);
//# sourceMappingURL=tutor-profile.controller.js.map