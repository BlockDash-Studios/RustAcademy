import { UserProfileService } from './user-profile.service';
import { UserProfileEntity } from './user-profile.entity';
export declare class UserProfileController {
    private readonly profileService;
    constructor(profileService: UserProfileService);
    create(dto: Partial<UserProfileEntity>): Promise<UserProfileEntity>;
    findAll(): Promise<UserProfileEntity[]>;
    findByUserId(userId: string): Promise<UserProfileEntity>;
    findById(id: string): Promise<UserProfileEntity>;
    update(id: string, updates: Partial<UserProfileEntity>): Promise<UserProfileEntity>;
    remove(id: string): Promise<boolean>;
}
