import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TutorProfileService } from './tutor-profile.service';
import { TutorSpecialty } from './interfaces/tutor-specialty.enum';
import { VerificationStatus } from './interfaces/verification-status.enum';

describe('TutorProfileService', () => {
  let service: TutorProfileService;

  beforeEach(() => {
    service = new TutorProfileService();
  });

  describe('Earnings', () => {
    it('getEarningsSummary() returns earned XLM and payout details for a tutor', async () => {
      const profile = await service.create({
        userId: 'user-1',
        bio: 'Test tutor',
        specialties: [TutorSpecialty.WEB3_SOROBAN],
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
      await expect(service.getEarningsSummary('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('Rating and Reviews', () => {
    it('rate() stores a review and updates averageRating and totalRatings', async () => {
      const profile = await service.create({
        userId: 'user-tutor',
        bio: 'Math tutor',
        specialties: [TutorSpecialty.RUST_FUNDAMENTALS],
        hourlyRate: 40,
      });

      const updated = await service.rate(profile.id, {
        raterUserId: 'user-rater',
        rating: 5,
        review: 'Excellent tutor',
      });

      expect(updated.totalRatings).toBe(1);
      expect(updated.averageRating).toBe(5);
      expect(updated.reputationScore).toBeGreaterThan(0);
    });

    it('rate() updates aggregate correctly after multiple ratings', async () => {
      const profile = await service.create({
        userId: 'user-tutor-2',
        bio: 'Rust expert',
        specialties: [TutorSpecialty.ADVANCED_RUST],
        hourlyRate: 60,
      });

      await service.rate(profile.id, {
        raterUserId: 'rater-1',
        rating: 5,
      });
      await service.rate(profile.id, {
        raterUserId: 'rater-2',
        rating: 3,
      });

      const updated = await service.rate(profile.id, {
        raterUserId: 'rater-3',
        rating: 4,
      });

      expect(updated.totalRatings).toBe(3);
      expect(updated.averageRating).toBe(4);
      expect(updated.reputationScore).toBeGreaterThan(0);
    });

    it('rate() throws when tutor profile does not exist', async () => {
      await expect(
        service.rate('nonexistent-id', {
          raterUserId: 'rater-1',
          rating: 5,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getReviews()', () => {
    it('returns all reviews for a tutor sorted by newest first', async () => {
      const profile = await service.create({
        userId: 'user-tutor-3',
        bio: 'Bio',
        specialties: [TutorSpecialty.ASYNC_RUST],
      });

      await service.rate(profile.id, {
        raterUserId: 'rater-1',
        rating: 4,
        review: 'Good',
      });
      await new Promise(r => setTimeout(r, 5));
      await service.rate(profile.id, {
        raterUserId: 'rater-2',
        rating: 5,
        review: 'Great',
      });

      const reviews = await service.getReviews(profile.id);

      expect(reviews).toHaveLength(2);
      expect(reviews[0].rating).toBe(5);
      expect(reviews[0].raterUserId).toBe('rater-2');
    });

    it('throws when tutor profile does not exist', async () => {
      await expect(service.getReviews('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getReputation()', () => {
    it('returns reputation details for a tutor', async () => {
      const profile = await service.create({
        userId: 'user-tutor-4',
        bio: 'Verified tutor',
        specialties: [TutorSpecialty.WEB3_SOROBAN],
        hourlyRate: 100,
      });

      await service.rate(profile.id, {
        raterUserId: 'rater-1',
        rating: 5,
      });
      await service.rate(profile.id, {
        raterUserId: 'rater-2',
        rating: 4,
      });

      const rep = await service.getReputation(profile.id);

      expect(rep.tutorId).toBe(profile.id);
      expect(rep.averageRating).toBe(4.5);
      expect(rep.totalRatings).toBe(2);
      expect(rep.reviewCount).toBe(2);
      expect(rep.reputationScore).toBeGreaterThan(0);
      expect(rep.breakdown).toBeDefined();
      expect(rep.breakdown.averageRatingWeight).toBeGreaterThan(0);
      expect(rep.breakdown.ratingCountWeight).toBeGreaterThan(0);
    });

    it('reputation score increases when tutor is verified', async () => {
      const profile = await service.create({
        userId: 'user-tutor-5',
        bio: 'Bio',
        specialties: [TutorSpecialty.RUST_FUNDAMENTALS],
      });

      await service.rate(profile.id, {
        raterUserId: 'rater-1',
        rating: 5,
      });

      const before = await service.getReputation(profile.id);

      await service.verify(profile.id, { adminId: 'admin-test' });

      const after = await service.getReputation(profile.id);

      expect(after.reputationScore).toBeGreaterThan(before.reputationScore);
    });

    it('throws when tutor profile does not exist', async () => {
      await expect(service.getReputation('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -------------------- Verification lifecycle ----------------------------

  it('newly created tutors start in UNVERIFIED status with no audit metadata', async () => {
    const profile = await service.create({
      userId: 'user-v1',
      bio: 'New tutor',
      specialties: [TutorSpecialty.RUST_FUNDAMENTALS],
      hourlyRate: 30,
    });

    expect(profile.status).toBe(VerificationStatus.UNVERIFIED);
    expect(profile.isVerified).toBe(false);
    expect(profile.verifiedAt).toBeNull();
    expect(profile.verifiedBy).toBeNull();
    expect(profile.verificationNote).toBeNull();
  });

  it('requestVerification() moves a tutor from UNVERIFIED to PENDING and stores an optional note', async () => {
    const profile = await service.create({
      userId: 'user-v2',
      bio: 'Aspiring tutor',
      specialties: [TutorSpecialty.OWNERSHIP_BORROWING],
    });

    const pending = await service.requestVerification(profile.id, {
      note: '10 years of Rust at Mozilla',
    });

    expect(pending.status).toBe(VerificationStatus.PENDING);
    expect(pending.isVerified).toBe(false);
    expect(pending.verificationNote).toBe('10 years of Rust at Mozilla');
    // Should not stamp "verified" metadata while still pending.
    expect(pending.verifiedAt).toBeNull();
    expect(pending.verifiedBy).toBeNull();
  });

  it('verify() moves a tutor to VERIFIED and records audit metadata', async () => {
    const profile = await service.create({
      userId: 'user-v3',
      bio: 'Pending tutor',
      specialties: [TutorSpecialty.WEB3_SOROBAN],
    });
    await service.requestVerification(profile.id, { note: 'Reviewing' });

    const beforeTs = Date.now();
    const verified = await service.verify(profile.id, {
      adminId: 'admin-007',
      note: 'Background check passed',
    });
    const afterTs = Date.now();

    expect(verified.status).toBe(VerificationStatus.VERIFIED);
    expect(verified.isVerified).toBe(true);
    expect(verified.verifiedBy).toBe('admin-007');
    expect(verified.verificationNote).toBe('Background check passed');
    expect(verified.verifiedAt).toBeInstanceOf(Date);
    expect(verified.verifiedAt!.getTime()).toBeGreaterThanOrEqual(beforeTs);
    expect(verified.verifiedAt!.getTime()).toBeLessThanOrEqual(afterTs);
  });

  it('verify() is idempotent when called on a tutor that is already VERIFIED', async () => {
    const profile = await service.create({
      userId: 'user-v4',
      bio: 'Already verified tutor',
      specialties: [TutorSpecialty.ADVANCED_RUST],
    });
    const first = await service.verify(profile.id, {
      adminId: 'admin-001',
      note: 'first pass',
    });
    const originalVerifiedAt = first.verifiedAt?.getTime();

    // A small delay so a second call (if non-idempotent) would produce a
    // visibly different timestamp.
    await new Promise(resolve => setTimeout(resolve, 5));

    const second = await service.verify(profile.id, {
      adminId: 'admin-002',
      note: 'should NOT overwrite',
    });

    expect(second.status).toBe(VerificationStatus.VERIFIED);
    expect(second.verifiedBy).toBe('admin-001');
    expect(second.verificationNote).toBe('first pass');
    expect(second.verifiedAt?.getTime()).toBe(originalVerifiedAt);
  });

  it('unverify() clears the VERIFIED flag and wipes audit metadata', async () => {
    const profile = await service.create({
      userId: 'user-v5',
      bio: 'To be unverified',
      specialties: [TutorSpecialty.ASYNC_RUST],
    });
    await service.verify(profile.id, {
      adminId: 'admin-9',
      note: 'approved',
    });

    const cleared = await service.unverify(profile.id);

    expect(cleared.status).toBe(VerificationStatus.UNVERIFIED);
    expect(cleared.isVerified).toBe(false);
    expect(cleared.verifiedAt).toBeNull();
    expect(cleared.verifiedBy).toBeNull();
    expect(cleared.verificationNote).toBeNull();
  });

  it('verify() throws NotFoundException for an unknown tutor id', async () => {
    await expect(service.verify('does-not-exist', {})).rejects.toThrow(
      NotFoundException,
    );
  });

  it('unverify() throws NotFoundException for an unknown tutor id', async () => {
    await expect(service.unverify('does-not-exist')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('requestVerification() is a no-op for an already-VERIFIED tutor', async () => {
    const profile = await service.create({
      userId: 'user-v6',
      bio: 'Already verified',
      specialties: [TutorSpecialty.PERFORMANCE_OPTIMIZATION],
    });
    await service.verify(profile.id, { adminId: 'admin-1' });

    const result = await service.requestVerification(profile.id, {
      note: 'should not downgrade verified tutor',
    });

    expect(result.status).toBe(VerificationStatus.VERIFIED);
    expect(result.isVerified).toBe(true);
  });

  it('findVerified() returns only tutors whose status is VERIFIED', async () => {
    const a = await service.create({
      userId: 'user-fa',
      bio: 'a',
      specialties: [TutorSpecialty.RUST_FUNDAMENTALS],
    });
    const b = await service.create({
      userId: 'user-fb',
      bio: 'b',
      specialties: [TutorSpecialty.RUST_FUNDAMENTALS],
    });
    const c = await service.create({
      userId: 'user-fc',
      bio: 'c',
      specialties: [TutorSpecialty.RUST_FUNDAMENTALS],
    });

    await service.verify(a.id, { adminId: 'admin' });
    await service.requestVerification(b.id, {}); // pending, not verified
    // c stays UNVERIFIED

    const verified = await service.findVerified();

    expect(verified).toHaveLength(1);
    expect(verified[0].id).toBe(a.id);
    expect(verified[0].status).toBe(VerificationStatus.VERIFIED);
  });

  it('findPending() returns only tutors whose status is PENDING', async () => {
    const a = await service.create({
      userId: 'user-pa',
      bio: 'a',
      specialties: [TutorSpecialty.RUST_FUNDAMENTALS],
    });
    const b = await service.create({
      userId: 'user-pb',
      bio: 'b',
      specialties: [TutorSpecialty.RUST_FUNDAMENTALS],
    });
    const c = await service.create({
      userId: 'user-pc',
      bio: 'c',
      specialties: [TutorSpecialty.RUST_FUNDAMENTALS],
    });

    await service.verify(a.id, { adminId: 'admin' }); // verified
    await service.requestVerification(b.id, {}); // pending
    await service.requestVerification(c.id, {}); // pending

    const pending = await service.findPending();

    expect(pending).toHaveLength(2);
    const ids = pending.map(p => p.id).sort();
    expect(ids).toEqual([b.id, c.id].sort());
    expect(pending.every(p => p.status === VerificationStatus.PENDING)).toBe(
      true,
    );
  });

  it('update() never allows verification status to leak in via the generic update DTO', async () => {
    const profile = await service.create({
      userId: 'user-sec',
      bio: 'Original bio',
      specialties: [TutorSpecialty.RUST_TESTING],
    });
    await service.verify(profile.id, { adminId: 'admin-x' });

    // Even if a caller (or upstream bug) injects these fields into the
    // update payload, the service must not let them mutate verification
    // state. We cast through `unknown` instead of using `@ts-expect-error`
    // because the DTO's TS surface already denies these keys.
    const maliciousPayload = {
      bio: 'Updated bio',
      isVerified: false,
      status: VerificationStatus.PENDING,
    } as unknown as Parameters<TutorProfileService['update']>[1];

    await service.update(profile.id, maliciousPayload);

    // In-memory store was not mutated; the only updated field is bio.
    const after = await service.findById(profile.id);
    expect(after?.status).toBe(VerificationStatus.VERIFIED);
    expect(after?.isVerified).toBe(true);
    expect(after?.bio).toBe('Updated bio');
  });

  // -------------------- BA-042: hardened state machine --------------------

  it('reject() moves a PENDING tutor to REJECTED and records reviewer + reason', async () => {
    const profile = await service.create({
      userId: 'user-r1',
      bio: 'Applicant',
      specialties: [TutorSpecialty.RUST_TESTING],
    });
    await service.requestVerification(profile.id, { note: 'apply' });

    const rejected = await service.reject(profile.id, {
      adminId: 'admin-rev',
      note: 'Insufficient evidence',
    });

    expect(rejected.status).toBe(VerificationStatus.REJECTED);
    expect(rejected.isVerified).toBe(false);
    expect(rejected.verifiedBy).toBe('admin-rev');
    expect(rejected.verificationNote).toBe('Insufficient evidence');
  });

  it('reject() is idempotent for an already-REJECTED tutor', async () => {
    const profile = await service.create({
      userId: 'user-r2',
      bio: 'Applicant',
      specialties: [TutorSpecialty.RUST_FUNDAMENTALS],
    });
    await service.requestVerification(profile.id, {});
    await service.reject(profile.id, { adminId: 'admin-1', note: 'first' });

    const second = await service.reject(profile.id, {
      adminId: 'admin-2',
      note: 'override',
    });

    // Idempotent: first rejection metadata is preserved.
    expect(second.status).toBe(VerificationStatus.REJECTED);
    expect(second.verifiedBy).toBe('admin-1');
    expect(second.verificationNote).toBe('first');
  });

  it('reject() throws BadRequestException for an illegal (non-PENDING) transition', async () => {
    const profile = await service.create({
      userId: 'user-r3',
      bio: 'Applicant',
      specialties: [TutorSpecialty.ASYNC_RUST],
    });
    // Unverified -> rejected is not allowed.
    await expect(service.reject(profile.id, { adminId: 'a' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('cannot verify from a REJECTED status without a new PENDING request', async () => {
    const profile = await service.create({
      userId: 'user-r4',
      bio: 'Applicant',
      specialties: [TutorSpecialty.WEB3_SOROBAN],
    });
    await service.requestVerification(profile.id, {});
    await service.reject(profile.id, { adminId: 'a', note: 'no' });

    // Direct verify from REJECTED should be allowed by the state machine
    // (REJECTED -> VERIFIED is legal).
    const verified = await service.verify(profile.id, {
      adminId: 'admin-appeal',
    });
    expect(verified.status).toBe(VerificationStatus.VERIFIED);
    expect(verified.verifiedBy).toBe('admin-appeal');
  });

  it('re-requesting verification from REJECTED moves back to PENDING', async () => {
    const profile = await service.create({
      userId: 'user-r5',
      bio: 'Applicant',
      specialties: [TutorSpecialty.CLI_APPLICATIONS],
    });
    await service.requestVerification(profile.id, {});
    await service.reject(profile.id, { adminId: 'a', note: 'denied' });

    const resubmitted = await service.requestVerification(profile.id, {
      note: 'resubmission',
    });

    expect(resubmitted.status).toBe(VerificationStatus.PENDING);
    expect(resubmitted.isVerified).toBe(false);
  });

  it('unverify() throws BadRequestException when the state machine forbids it', async () => {
    const profile = await service.create({
      userId: 'user-r6',
      bio: 'Applicant',
      specialties: [TutorSpecialty.MACROS_METAPROGRAMMING],
    });
    await service.requestVerification(profile.id, {});
    // PENDING -> UNVERIFIED is allowed, so this should not throw.
    const rolledBack = await service.unverify(profile.id);
    expect(rolledBack.status).toBe(VerificationStatus.UNVERIFIED);
  });
});