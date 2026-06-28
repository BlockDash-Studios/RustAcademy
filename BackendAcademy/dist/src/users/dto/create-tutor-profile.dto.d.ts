import { TutorSpecialty } from '../interfaces/tutor-specialty.enum';
export declare class CreateTutorProfileDto {
    userId: string;
    bio: string;
    specialties: TutorSpecialty[];
    hourlyRate?: number;
    availability?: boolean;
}
