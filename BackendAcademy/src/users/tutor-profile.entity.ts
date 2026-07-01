import { TutorSpecialty } from './interfaces/tutor-specialty.enum';
import { VerificationStatus } from './interfaces/verification-status.enum';

export class TutorProfileEntity {
  id: string;
  userId: string;
  bio: string;
  specialties: TutorSpecialty[];
  reputationScore: number;
  totalRatings: number;
  averageRating: number;
  coursesCreated: number;
  totalEarnings: number;
  isVerified: boolean;
  status: VerificationStatus;
  verifiedAt: Date | null;
  verifiedBy: string | null;
  verificationNote: string | null;
  availability: boolean;
  hourlyRate: number;
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<TutorProfileEntity>) {
    Object.assign(this, partial);
    this.createdAt = this.createdAt || new Date();
    this.updatedAt = this.updatedAt || new Date();
    this.status = this.status ?? VerificationStatus.UNVERIFIED;
    // Keep isVerified as a convenience derived value so legacy consumers
    // (existing tests, frontend clients) keep working.
    this.isVerified = this.isVerified ?? this.status === VerificationStatus.VERIFIED;
    this.availability = this.availability ?? true;
    this.reputationScore = this.reputationScore || 0;
    this.totalRatings = this.totalRatings || 0;
    this.averageRating = this.averageRating || 0;
    this.coursesCreated = this.coursesCreated || 0;
    this.totalEarnings = this.totalEarnings || 0;
    this.specialties = this.specialties || [];
    this.hourlyRate = this.hourlyRate || 0;
    this.verifiedAt = this.verifiedAt ?? null;
    this.verifiedBy = this.verifiedBy ?? null;
    this.verificationNote = this.verificationNote ?? null;
  }
}
