// src/modules/users/users.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { LearnerProfileResponseDto } from './dto/learner-profile.dto';

@Injectable()
export class UsersService {
    constructor(private readonly prisma: PrismaService) {}

    async getLearnerProfile(userId: string): Promise<LearnerProfileResponseDto> {
        const user = await.prisma.user.findUnique({
            where: { id: userId },
            include: {
                gamificationStats: true,
                completedLessons: true,
                completedQuests: true,
            },
        });

        if (!user) {
            throw new NotFoundException(`Learner profile with ID ${userId} not found`);
        }

        const stats = user.gamificationStats || {
            xp: 0,
            level: 1,
            currentStreak: 0,
            longestStreak: 0,
        };

        return {
            id: user.id,
            walletAddress: user.walletAddress,
            username: user.username || 'Anonymous Learner',
            xp: stats.xp,
            level: stats.level,
            currentStreak: stats.currentStreak,
            longestStreak: stats.longestStreak,
            totalCompletedLessons: user.completedLessons?.length || 0,
            totalCompletedQuests: user.completedQuests?.length || 0,
            updatedAt: user.updatedAt.toISOString(),
        };
    }
}