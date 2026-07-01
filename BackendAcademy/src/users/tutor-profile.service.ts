import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { TutorProfileEntity } from './tutor-profile.entity';
import { CreateTutorProfileDto } from './dto/create-tutor-profile.dto';
import { UpdateTutorProfileDto } from './dto/update-tutor-profile.dto';
import { RateTutorDto } from './dto/rate-tutor.dto';
import { VerifyTutorDto } from './dto/verify-tutor.dto';
import { RequestVerificationDto } from './dto/request-verification.dto';
import { VerificationStatus } from './interfaces/verification-status.enum';

export interface TutorEarningsSummary {
  tutorId: string;
  earnedXlm: number;
  totalPaidOut: number;
  pendingPayouts: number;
  payouts: Array<{
    id: string;
    amount: number;
    status: 'pending' | 'completed';
    paidAt?: Date;
  }>;
}

@Injectable()
export class TutorProfileService {
  private readonly profiles: Map<string, TutorProfileEntity> = new Map();

  async create(dto: CreateTutorProfileDto): Promise<TutorProfileEntity> {
    const profile = new TutorProfileEntity({
      id: crypto.randomUUID(),
      ...dto,
    });
    this.profiles.set(profile.id, profile);
    return profile;
  }

  async findAll(): Promise<TutorProfileEntity[]> {
    return Array.from(this.profiles.values());
  }

  async findById(id: string): Promise<TutorProfileEntity | null> {
    return this.profiles.get(id) || null;
  }

  async findByUserId(userId: string): Promise<TutorProfileEntity | null> {
    return (
      Array.from(this.profiles.values()).find(p => p.userId === userId) || null
    );
  }

  async findBySpecialty(specialty: string): Promise<TutorProfileEntity[]> {
    return Array.from(this.profiles.values()).filter(p =>
      p.specialties.includes(specialty as any),
    );
  }

  async update(
    id: string,
    dto: UpdateTutorProfileDto,
  ): Promise<TutorProfileEntity | null> {
    const profile = this.profiles.get(id);
    if (!profile) return null;
    // Defensive: never allow verification status to be mutated via the
    // generic update path. Even if a malicious / buggy caller injects
    // `isVerified` or `status` into the payload, strip them here so they
    // can never reach the in-memory store. Using rest destructuring
    // (rather than a shallow copy) is what actually excludes the keys.
    const {
      isVerified: _ignoredIsVerified,
      status: _ignoredStatus,
      ...safe
    } = dto as UpdateTutorProfileDto & {
      isVerified?: unknown;
      status?: unknown;
    };
    void _ignoredIsVerified;
    void _ignoredStatus;
    Object.assign(profile, safe, { updatedAt: new Date() });
    return profile;
  }

  async rate(id: string, dto: RateTutorDto): Promise<TutorProfileEntity> {
    const profile = this.profiles.get(id);
    if (!profile) throw new NotFoundException('Tutor profile not found');
    const total = profile.totalRatings * profile.averageRating + dto.rating;
    profile.totalRatings += 1;
    profile.averageRating = total / profile.totalRatings;
    profile.updatedAt = new Date();
    return profile;
  }

  async incrementCoursesCreated(id: string): Promise<void> {
    const profile = this.profiles.get(id);
    if (profile) {
      profile.coursesCreated += 1;
      profile.updatedAt = new Date();
    }
  }

  async updateEarnings(id: string, amount: number): Promise<void> {
    const profile = this.profiles.get(id);
    if (profile) {
      profile.totalEarnings += amount;
      profile.updatedAt = new Date();
    }
  }

  async getEarningsSummary(id: string): Promise<TutorEarningsSummary> {
    const profile = this.profiles.get(id);
    if (!profile) {
      throw new NotFoundException('Tutor profile not found');
    }

    return {
      tutorId: profile.id,
      earnedXlm: profile.totalEarnings,
      totalPaidOut: 0,
      pendingPayouts: 0,
      payouts: [],
    };
  }

  async remove(id: string): Promise<boolean> {
    return this.profiles.delete(id);
  }

  // ------------------------------------------------------------------
  // Verification lifecycle
  // ------------------------------------------------------------------

  /**
   * Tutor-initiated: apply for verification. Moves a tutor from any state
   * (except VERIFIED) into PENDING. Calling on a VERIFIED tutor is a no-op
   * because they are already approved.
   */
  async requestVerification(
    id: string,
    dto: RequestVerificationDto,
  ): Promise<TutorProfileEntity> {
    const profile = this.requireProfile(id);

    if (profile.status === VerificationStatus.VERIFIED) {
      // Idempotent: already verified.
      return profile;
    }

    profile.status = VerificationStatus.PENDING;
    profile.isVerified = false;
    profile.verificationNote = dto.note ?? null;
    profile.updatedAt = new Date();
    return profile;
  }

  /**
   * Admin-initiated: verify a tutor. Records who verified and when, plus an
   * optional note. Idempotent for already-VERIFIED tutors (returns the
   * existing profile unchanged) so retried calls are safe.
   */
  async verify(
    id: string,
    dto: VerifyTutorDto,
  ): Promise<TutorProfileEntity> {
    const profile = this.requireProfile(id);

    if (profile.status === VerificationStatus.VERIFIED) {
      // Idempotent: already verified.
      return profile;
    }

    profile.status = VerificationStatus.VERIFIED;
    profile.isVerified = true;
    profile.verifiedAt = new Date();
    profile.verifiedBy = dto.adminId ?? profile.verifiedBy ?? null;
    profile.verificationNote = dto.note ?? null;
    profile.updatedAt = new Date();
    return profile;
  }

  /**
   * Admin-initiated: remove a tutor's verified status. Clears all
   * verification metadata so downstream consumers cannot rely on stale data.
   */
  async unverify(id: string): Promise<TutorProfileEntity> {
    const profile = this.requireProfile(id);
    profile.status = VerificationStatus.UNVERIFIED;
    profile.isVerified = false;
    profile.verifiedAt = null;
    profile.verifiedBy = null;
    profile.verificationNote = null;
    profile.updatedAt = new Date();
    return profile;
  }

  /**
   * List every tutor whose status is VERIFIED. Used by the public
   * "verified tutors" surface and admin dashboards.
   */
  async findVerified(): Promise<TutorProfileEntity[]> {
    return Array.from(this.profiles.values()).filter(
      p => p.status === VerificationStatus.VERIFIED,
    );
  }

  /**
   * List every tutor awaiting verification review (PENDING).
   */
  async findPending(): Promise<TutorProfileEntity[]> {
    return Array.from(this.profiles.values()).filter(
      p => p.status === VerificationStatus.PENDING,
    );
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private requireProfile(id: string): TutorProfileEntity {
    const profile = this.profiles.get(id);
    if (!profile) {
      throw new NotFoundException(`Tutor profile ${id} not found`);
    }
    return profile;
  }

  /**
   * Internal helper used by the controller to validate that a status
   * transition is legal. Currently exposed for callers that want explicit
   * feedback rather than silent idempotency.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private assertCanTransition(
    from: VerificationStatus,
    to: VerificationStatus,
  ): void {
    const allowed: Record<VerificationStatus, VerificationStatus[]> = {
      [VerificationStatus.UNVERIFIED]: [
        VerificationStatus.PENDING,
        VerificationStatus.VERIFIED,
      ],
      [VerificationStatus.PENDING]: [
        VerificationStatus.VERIFIED,
        VerificationStatus.REJECTED,
        VerificationStatus.UNVERIFIED,
      ],
      [VerificationStatus.VERIFIED]: [VerificationStatus.UNVERIFIED],
      [VerificationStatus.REJECTED]: [
        VerificationStatus.PENDING,
        VerificationStatus.VERIFIED,
      ],
    };
    if (!allowed[from].includes(to)) {
      throw new BadRequestException(
        `Illegal verification transition: ${from} -> ${to}`,
      );
    }
  }
}
