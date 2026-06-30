import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { CourseService } from './course.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { CompleteCourseDto } from './dto/complete-course.dto';

@Controller('courses')
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

  @Post()
  async create(@Body() dto: CreateCourseDto) {
    return this.courseService.create(dto);
  }

  @Get()
  async findAll() {
    return this.courseService.findAll();
  }

  @Get('level/:level')
  async findByLevel(@Param('level') level: string) {
    return this.courseService.findByLevel(level);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.courseService.findById(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.courseService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.courseService.remove(id);
  }

  @Post(':id/complete')
  async complete(@Param('id') id: string, @Body() dto: CompleteCourseDto) {
    return this.courseService.completeCourse(id, dto.userId);
  }
}
