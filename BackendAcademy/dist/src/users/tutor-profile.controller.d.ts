import { TutorProfileService } from './tutor-profile.service';
import { CreateTutorProfileDto } from './dto/create-tutor-profile.dto';
import { UpdateTutorProfileDto } from './dto/update-tutor-profile.dto';
import { RateTutorDto } from './dto/rate-tutor.dto';
export declare class TutorProfileController {
    private readonly tutorService;
    constructor(tutorService: TutorProfileService);
    create(dto: CreateTutorProfileDto): Promise<import("./tutor-profile.entity").TutorProfileEntity>;
    findAll(): Promise<import("./tutor-profile.entity").TutorProfileEntity[]>;
    findByUserId(userId: string): Promise<import("./tutor-profile.entity").TutorProfileEntity>;
    findBySpecialty(specialty: string): Promise<import("./tutor-profile.entity").TutorProfileEntity[]>;
    findById(id: string): Promise<import("./tutor-profile.entity").TutorProfileEntity>;
    getEarningsSummary(id: string): Promise<import("./tutor-profile.service").TutorEarningsSummary>;
    update(id: string, dto: UpdateTutorProfileDto): Promise<import("./tutor-profile.entity").TutorProfileEntity>;
    rate(id: string, dto: RateTutorDto): Promise<import("./tutor-profile.entity").TutorProfileEntity>;
    remove(id: string): Promise<boolean>;
}
