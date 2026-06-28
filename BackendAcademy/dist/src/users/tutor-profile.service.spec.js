"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const tutor_profile_service_1 = require("./tutor-profile.service");
const tutor_specialty_enum_1 = require("./interfaces/tutor-specialty.enum");
describe('TutorProfileService', () => {
    let service;
    beforeEach(() => {
        service = new tutor_profile_service_1.TutorProfileService();
    });
    it('getEarningsSummary() returns earned XLM and payout details for a tutor', async () => {
        const profile = await service.create({
            userId: 'user-1',
            bio: 'Test tutor',
            specialties: [tutor_specialty_enum_1.TutorSpecialty.WEB3_SOROBAN],
            hourlyRate: 50,
        });
        await service.updateEarnings(profile.id, 120);
        const summary = await service.getEarningsSummary(profile.id);
        expect(summary).toMatchObject({
            tutorId: profile.id,
            earnedXlm: 120,
            totalPaidOut: 0,
            pendingPayouts: 0,
            payouts: [],
        });
    });
    it('getEarningsSummary() throws when the tutor profile does not exist', async () => {
        await expect(service.getEarningsSummary('missing-id')).rejects.toThrow(common_1.NotFoundException);
    });
});
//# sourceMappingURL=tutor-profile.service.spec.js.map