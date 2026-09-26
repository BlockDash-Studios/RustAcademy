// src/modules/users/dto/learner-profile.dto.ts
export interface LearnerProfileResponseDto {
    id: string;
    walletAddress: string;
    username: string;
    xp: number;
    level: number;
    currentStreak: number;
    longestStreak: number;
    totalCompletedLessons: number;
    totalCompletedQuests: number;
    updatedAt: string;
}