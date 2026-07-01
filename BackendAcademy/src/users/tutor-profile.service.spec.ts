import { NotFoundException } from '@nestjs/common';
import { TutorProfileService } from './tutor-profile.service';
import { TutorSpecialty } from './interfaces/tutor-specialty.enum';
import { VerificationStatus } from './interfaces/verification-status.enum';

describe('TutorProfileService', () => {
  let service: TutorProfileService;

  beforeEach(() => {
    service = new TutorProfileService();
  });

  // -------------------- Earnings (existing behavior preserved) -----------

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
});
