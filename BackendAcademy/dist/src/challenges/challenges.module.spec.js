"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const challenges_controller_1 = require("./challenges.controller");
const challenges_module_1 = require("./challenges.module");
const challenges_service_1 = require("./challenges.service");
describe('ChallengesModule', () => {
    it('registers challenge voting controller and service', async () => {
        const moduleRef = await testing_1.Test.createTestingModule({
            imports: [challenges_module_1.ChallengesModule],
        }).compile();
        expect(moduleRef.get(challenges_controller_1.ChallengesController)).toBeInstanceOf(challenges_controller_1.ChallengesController);
        expect(moduleRef.get(challenges_service_1.ChallengesService)).toBeInstanceOf(challenges_service_1.ChallengesService);
    });
});
//# sourceMappingURL=challenges.module.spec.js.map