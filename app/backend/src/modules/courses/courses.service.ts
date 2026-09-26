// src/modules/courses/courses.service.ts
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateCourseDto, CourseLevel } from './dto/create-course.dto';

export interface CourseFilterQuery {
    level?: CourseLevel;
    tag?: string;
    search?: string;
}

@Injectable()
export class CoursesService {
    constructor(private readonly prisma: PrismaService) {}

    async createCourse(tutorId: string, dto: CreateCourseDto) {
        return this.prisma.course.create({
            data: {
                title: dto.title,
                description: dto.description,
                level: dto.level,
                tags: dto.tags,
                price: dto.price || 0,
                tutorId,
            },
        });
    }

    async getCatalog(query: CourseFilterQuery) {
        const { level, tag, search } = query;

        return this.prisma.course.findMany({
            where: {
                ...(level && { level }),
                ...(tag && { tags: { has: tag } }),
                ...(search && {
                    OR: [
                        { title: { contains: search, mode: 'insensitive' } },
                        { description: { contains: search, mode: 'insensitive' } },
                    ],
                }),
            },
            include: {
                tutor: { select: { id: true, username: true } },
                _count: { select: { lessons: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getCourseDetail(courseId: string) {
        const course = await this.prisma.course.findUnique({
            where: { id: courseId },
            include: {
                tutor: { select: { id: true, username: true } },
                lessons: {
                    orderBy: { orderIndex: 'asc' },
                    select: { id: true, title: true, orderIndex: true, durationMinutes: true },
                },
            },
        });

        if (!course) {
            throw new NotFoundException(`Course with ID ${courseId} not found`);
        }

        return course;
    }

    async deleteCourse(tutorId: string, courseId: string) {
        const course = await this.prisma.course.findUnique({ where: { id: courseId } });
        if (!course) {
            throw new NotFoundException(`Course not found`);
        }
        if (course.tutorId !== tutorId) {
            throw new ForbiddenException(`Only the course owner can delete this course`);
        }
        return this.prisma.course.delete({ where: { id: courseId } });
    }
}