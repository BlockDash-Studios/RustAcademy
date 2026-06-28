import { TutorSpecialty } from './interfaces/tutor-specialty.enum';
export declare class TutorProfileEntity {
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
    constructor(partial: Partial<TutorProfileEntity>);
}
