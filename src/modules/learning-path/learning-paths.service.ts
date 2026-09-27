// src/modules/learning-paths/learning-paths.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateLearningPathDto } from './dto/create-learning-path.dto';

@Injectable()
export class LearningPathsService {
    constructor(private readonly prisma: PrismaService) {}

    async getAllPaths() {
        return this.prisma.learningPath.findMany({
            orderBy: { orderIndex: 'asc' },
            include: {
                courses: {
                    include: {
                        tutor: { select: { id: true, username: true, displayName: true } },
                    },
                },
            },
        });
    }

    async getPathById(pathId: string) {
        const path = await this.prisma.learningPath.findUnique({
            where: { id: pathId },
            include: {
                courses: {
                    orderBy: { createdAt: 'asc' },
                    include: { lessons: { select: { id: true, title: true, orderIndex: true } } },
                },
            },
        });

        if (!path) {
            throw new NotFoundException(`Learning path with ID ${pathId} not found`);
        }

        return path;
    }

    async createPath(dto: CreateLearningPathDto) {
        return this.prisma.learningPath.create({
            data: {
                title: dto.title,
                description: dto.description,
                orderIndex: dto.orderIndex,
                courses: dto.courseIds
                    ? { connect: dto.courseIds.map((id) => ({ id })) }
                    : undefined,
            },
            include: { courses: true },
        });
    }
}