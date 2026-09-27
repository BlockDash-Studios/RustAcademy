// src/modules/users/account.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AccountService {
    constructor(private readonly prisma: PrismaService) {}

    async exportUserData(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                completedLessons: true,
                completedQuests: true,
                courses: { include: { lessons: true } },
                gamificationStats: true,
            },
        });

        if (!user) {
            throw new NotFoundException(`User with ID ${userId} not found`);
        }

        // Return structured GDPR JSON payload of all owned personal entities
        return {
            exportTimestamp: new Date().toISOString(),
            profile: {
                id: user.id,
                walletAddress: user.walletAddress,
                username: user.username,
                displayName: user.displayName,
                bio: user.bio,
                avatarUrl: user.avatarUrl,
                specialties: user.specialties,
                createdAt: user.createdAt,
            },
            gamification: user.gamificationStats,
            learningProgress: {
                completedLessons: user.completedLessons,
                completedQuests: user.completedQuests,
            },
            createdCourses: user.courses,
        };
    }

    async deleteAccount(userId: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new NotFoundException(`User with ID ${userId} not found`);
        }

        // Execute transaction: Anonymize financial/ledger records while removing personal profile data
        return this.prisma.$transaction(async (tx) => {
            // 1. Anonymize user profile & remove PII
            const anonymizedUser = await tx.user.update({
                where: { id: userId },
                data: {
                    username: `anonymous_${userId.slice(0, 8)}`,
                    displayName: 'Anonymized Learner',
                    bio: null,
                    avatarUrl: null,
                    specialties: [],
                    tutorApplicationStatus: 'DELETED',
                    isVerifiedTutor: false,
                },
            });

            // 2. Clear sensitive relational session data
            await tx.gamificationStats.deleteMany({ where: { userId } });

            // 3. Preserve on-chain/payout history by detaching or keeping wallet reference without PII
            return {
                message: 'Account successfully deleted and personal data anonymized. On-chain ledger history preserved.',
                userId: anonymizedUser.id,
                walletAddress: anonymizedUser.walletAddress, // retained for immutable financial integrity
            };
        });
    }
}