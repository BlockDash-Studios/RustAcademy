import { UserProfileEntity } from './user-profile.entity';
export declare class UserProfileService {
    private readonly profiles;
    create(profile: Partial<UserProfileEntity>): Promise<UserProfileEntity>;
    findAll(): Promise<UserProfileEntity[]>;
    findById(id: string): Promise<UserProfileEntity | null>;
    findByUserId(userId: string): Promise<UserProfileEntity | null>;
    update(id: string, updates: Partial<UserProfileEntity>): Promise<UserProfileEntity | null>;
    remove(id: string): Promise<boolean>;
}
