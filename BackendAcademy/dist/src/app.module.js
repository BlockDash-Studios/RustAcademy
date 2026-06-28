"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const throttler_1 = require("@nestjs/throttler");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const challenges_module_1 = require("./challenges/challenges.module");
const rewards_module_1 = require("./rewards/rewards.module");
const security_module_1 = require("./security/security.module");
const submission_module_1 = require("./submissions/submission.module");
const tutor_profile_module_1 = require("./users/tutor-profile.module");
const user_profile_module_1 = require("./users/user-profile.module");
const ai_module_1 = require("./ai/ai.module");
const leaderboard_module_1 = require("./leaderboard/leaderboard.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            throttler_1.ThrottlerModule.forRoot([
                {
                    limit: 10,
                    ttl: 60_000,
                },
            ]),
            user_profile_module_1.UserProfileModule,
            tutor_profile_module_1.TutorProfileModule,
            submission_module_1.SubmissionModule,
            rewards_module_1.RewardsModule,
            security_module_1.SecurityModule,
            challenges_module_1.ChallengesModule,
            ai_module_1.AiModule,
            leaderboard_module_1.LeaderboardModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [
            app_service_1.AppService,
            {
                provide: core_1.APP_GUARD,
                useClass: throttler_1.ThrottlerGuard,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map