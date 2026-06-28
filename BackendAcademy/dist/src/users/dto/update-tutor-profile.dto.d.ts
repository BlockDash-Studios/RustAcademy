import { TutorSpecialty } from '../interfaces/tutor-specialty.enum';
export declare class UpdateTutorProfileDto {
    bio?: string;
    specialties?: TutorSpecialty[];
    hourlyRate?: number;
    availability?: boolean;
    isVerified?: boolean;
}
