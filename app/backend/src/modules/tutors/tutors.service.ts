import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TutorApplicationDto } from './dto/tutor-application.dto';

@Injectable()
export class TutorsService {
    constructor(private readonly prisma: PrismaService) {}

    async applyForTutor(userId: string, dto: TutorApplicationDto) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new NotFoundException(`User not found`);
        }

        if (user.isVerifiedTutor || user.tutorApplicationStatus === 'PENDING') {
            throw new BadRequestException('User is already a verified tutor or has a pending application.');
        }

        return this.prisma.user.update({
            where: { id: userId },
            data: {
                tutorApplicationStatus: 'PENDING',
                statementOfExpertise: dto.statementOfExpertise,
                sampleLessonUrl: dto.sampleLessonUrl,
            },
            select: { id: true, tutorApplicationStatus: true },
        });
    }

    async getPendingApplications(adminId: string) {
        // Admin authorization check omitted for brevity
        return this.prisma.user.findMany({
            where: { tutorApplicationStatus: 'PENDING' },
            select: { id: true, username: true, walletAddress: true, statementOfExpertise: true, sampleLessonUrl: true, createdAt: true },
        });
    }

    async reviewApplication(adminId: string, targetUserId: string, approved: boolean) {
        const targetUser = await this.prisma.user.findUnique({ where: { id: targetUserId } });
        if (!targetUser || targetUser.tutorApplicationStatus !== 'PENDING') {
            throw new NotFoundException('Pending tutor application not found');
        }

        return this.prisma.user.update({
            where: { id: targetUserId },
            data: {
                isVerifiedTutor: approved,
                tutorApplicationStatus: approved ? 'APPROVED' : 'REJECTED',
            },
            select: { id: true, isVerifiedTutor: true, tutorApplicationStatus: true },
        });
    }
}