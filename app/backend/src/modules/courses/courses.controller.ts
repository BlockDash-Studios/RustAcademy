// src/modules/courses/courses.controller.ts
import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { CoursesService, CourseFilterQuery } from './courses.service';
import { CreateCourseDto, CourseLevel } from './dto/create-course.dto';

@Controller('api/v1/courses')
export class CoursesController {
    constructor(private readonly coursesService: CoursesService) {}

    @Post()
    async create(@Req() req: any, @Body() dto: CreateCourseDto) {
        const tutorId = req.user?.id || 'mock-tutor-id'; // Auth guard context
        return this.coursesService.createCourse(tutorId, dto);
    }

    @Get()
    async getCatalog(
        @Query('level') level?: CourseLevel,
        @Query('tag') tag?: string,
        @Query('search') search?: string,
    ) {
        return this.coursesService.getCatalog({ level, tag, search });
    }

    @Get(':id')
    async getDetail(@Param('id') id: string) {
        return this.coursesService.getCourseDetail(id);
    }

    @Delete(':id')
    async remove(@Req() req: any, @Param('id') id: string) {
        const tutorId = req.user?.id || 'mock-tutor-id';
        return this.coursesService.deleteCourse(tutorId, id);
    }
}