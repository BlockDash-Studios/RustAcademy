"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TutorProfileModule = void 0;
const common_1 = require("@nestjs/common");
const tutor_profile_controller_1 = require("./tutor-profile.controller");
const tutor_profile_service_1 = require("./tutor-profile.service");
let TutorProfileModule = class TutorProfileModule {
};
exports.TutorProfileModule = TutorProfileModule;
exports.TutorProfileModule = TutorProfileModule = __decorate([
    (0, common_1.Module)({
        controllers: [tutor_profile_controller_1.TutorProfileController],
        providers: [tutor_profile_service_1.TutorProfileService],
        exports: [tutor_profile_service_1.TutorProfileService],
    })
], TutorProfileModule);
//# sourceMappingURL=tutor-profile.module.js.map