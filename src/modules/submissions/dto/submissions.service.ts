// src/modules/submissions/submissions.service.ts
import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';

@Injectable()
export class SubmissionsService {
    constructor(private readonly prisma: PrismaService) {}

    async submitTask(learnerId: string, dto: CreateSubmissionDto) {
        // 1. Verify task exists and get associated course
        const task = await this.prisma.task.findUnique({
            where: { id: dto.taskId },
            include: { lesson: { include: { course: true } } },
        });

        if (!task) {
            throw new NotFoundException(`Task with ID ${dto.taskId} not found`);
        }

        const courseId = task.lesson.courseId;

        // 2. Enforce course enrollment check
        const enrollment = await this.prisma.enrollment.findUnique({
            where: { userId_courseId: { userId: learnerId, courseId } },
        });

        if (!enrollment) {
            throw new ForbiddenException(`You must be enrolled in the course to submit solutions for this task.`);
        }

        // 3. Enforce one-open-submission rule (cannot submit if a 'PENDING' submission already exists)
        const existingPending = await this.prisma.taskSubmission.findFirst({
            where: {
                userId: learnerId,
                taskId: dto.taskId,
                status: 'PENDING',
            },
        });

        if (existingPending) {
            throw new BadRequestException(`You already have a pending submission for this task awaiting evaluation.`);
        }

        // 4. Create new task submission
        return this.prisma.taskSubmission.create({
            data: {
                userId: learnerId,
                taskId: dto.taskId,
                code: dto.code,
                languageVersion: dto.languageVersion,
                status: 'PENDING',
            },
        });
    }

    async getLearnerSubmissions(learnerId: string, taskId?: string) {
        return this.prisma.taskSubmission.findMany({
            where: {
                userId: learnerId,
                ...(taskId ? { taskId } : {}),
            },
            orderBy: { createdAt: 'desc' },
            include: { task: { select: { id: true, title: true } } },
        });
    }
}