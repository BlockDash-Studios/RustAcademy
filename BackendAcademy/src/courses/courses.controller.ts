import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CreateCourseDto, CreateTaskDto, LearnerDto, SubmitTaskDto } from './dto/course.dto';

@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Post()
  create(@Body() dto: CreateCourseDto) {
    return this.courses.create(dto);
  }

  @Get(':courseId')
  get(@Param('courseId') courseId: string) {
    return this.courses.get(courseId);
  }

  @Post(':courseId/enrollments')
  enroll(@Param('courseId') courseId: string, @Body() dto: LearnerDto) {
    return this.courses.enroll(courseId, dto.userId);
  }

  @Post(':courseId/enrollments/withdraw')
  @HttpCode(200)
  withdraw(@Param('courseId') courseId: string, @Body() dto: LearnerDto) {
    return this.courses.withdraw(courseId, dto.userId);
  }

  @Post(':courseId/enrollments/complete')
  @HttpCode(200)
  complete(@Param('courseId') courseId: string, @Body() dto: LearnerDto) {
    return this.courses.complete(courseId, dto.userId);
  }

  @Post(':courseId/tasks')
  createTask(@Param('courseId') courseId: string, @Body() dto: CreateTaskDto) {
    return this.courses.createTask(courseId, dto.taskId);
  }

  @Post(':courseId/tasks/:taskId/submissions')
  submit(
    @Param('courseId') courseId: string,
    @Param('taskId') taskId: string,
    @Body() dto: SubmitTaskDto,
  ) {
    return this.courses.submit(courseId, taskId, dto);
  }
}
