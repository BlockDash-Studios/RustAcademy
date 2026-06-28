"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const submissions_module_1 = require("./submissions.module");
const submissions_controller_1 = require("./submissions.controller");
const submissions_service_1 = require("./submissions.service");
describe('SubmissionsModule', () => {
    it('should register the submissions controller and service', async () => {
        const moduleRef = await testing_1.Test.createTestingModule({
            imports: [submissions_module_1.SubmissionsModule],
        }).compile();
        expect(moduleRef.get(submissions_controller_1.SubmissionsController)).toBeInstanceOf(submissions_controller_1.SubmissionsController);
        expect(moduleRef.get(submissions_service_1.SubmissionsService)).toBeInstanceOf(submissions_service_1.SubmissionsService);
    });
});
//# sourceMappingURL=submissions.module.spec.js.map