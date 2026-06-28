import { TutorProfileEntity } from './tutor-profile.entity';
import { CreateTutorProfileDto } from './dto/create-tutor-profile.dto';
import { UpdateTutorProfileDto } from './dto/update-tutor-profile.dto';
import { RateTutorDto } from './dto/rate-tutor.dto';
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
export declare class TutorProfileService {
    private readonly profiles;
    create(dto: CreateTutorProfileDto): Promise<TutorProfileEntity>;
    findAll(): Promise<TutorProfileEntity[]>;
    findById(id: string): Promise<TutorProfileEntity | null>;
    findByUserId(userId: string): Promise<TutorProfileEntity | null>;
    findBySpecialty(specialty: string): Promise<TutorProfileEntity[]>;
    update(id: string, dto: UpdateTutorProfileDto): Promise<TutorProfileEntity | null>;
    rate(id: string, dto: RateTutorDto): Promise<TutorProfileEntity>;
    incrementCoursesCreated(id: string): Promise<void>;
    updateEarnings(id: string, amount: number): Promise<void>;
    getEarningsSummary(id: string): Promise<TutorEarningsSummary>;
    remove(id: string): Promise<boolean>;
}
