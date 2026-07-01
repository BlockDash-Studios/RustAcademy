import { TutorSpecialty } from './tutor-specialty.enum';
import { VerificationStatus } from './verification-status.enum';

export interface ITutorProfile {
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
}
