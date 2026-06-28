import { TutorSpecialty } from './tutor-specialty.enum';
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
    availability: boolean;
    hourlyRate: number;
    createdAt: Date;
    updatedAt: Date;
}
