// src/modules/lessons/lessons.controller.ts
import { Controller, Get, Post, Patch, Body, Param, Req, UseGuards } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { ReorderLessonsDto } from './dto/reorder-lessons.dto';

@Controller('api/v1/courses/:courseId/lessons')
export class LessonsController {
    constructor(private readonly lessonsService: LessonsService) {}

    @Post()
    async createLesson(
        @Req() req: any,
        @Param('courseId') courseId: string,
        @Body() dto: CreateLessonDto,
    ) {
        const tutorId = req.user?.id || 'mock-tutor-id';
        return this.lessonsService.createLesson(tutorId, courseId, dto);
    }

    @Patch('reorder')
    async reorderLessons(
        @Req() req: any,
        @Param('courseId') courseId: string,
        @Body() dto: ReorderLessonsDto,
    ) {
        const tutorId = req.user?.id || 'mock-tutor-id';
        return this.lessonsService.reorderLessons(tutorId, courseId, dto);
    }
}

@Controller('api/v1/lessons')
export class LessonDetailController {
    constructor(private readonly lessonsService: LessonsService) {}

    @Get(':id')
    async getDetail(@Param('id') id: string) {
        return this.lessonsService.getLessonDetail(id);
    }
}