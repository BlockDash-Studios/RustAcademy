import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CompleteLessonDto } from './dto/complete-lesson.dto';
import { CompleteTaskDto } from './dto/complete-task.dto';
import { RegisterCourseDto } from './dto/register-course.dto';
import { ProgressService } from './progress.service';

/**
 * REST surface for per-learner progress (BE-038).
 *
 * Base path: /api/v1/progress
 *
 * The controller stays thin — ProgressService owns completion rules and lets
 * NestJS's global exception filter map service exceptions to status codes:
 *
 *   NotFoundException  (404) → unknown course / lesson / task
 *   ConflictException  (409) → course manifest already registered
 *   BadRequestException(400) → already completed / manifest without content
 */
@ApiTags('progress')
@Controller('v1/progress')
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Post('courses')
  @ApiOperation({ summary: 'Register the lessons and tasks a course expects' })
  registerCourse(@Body() dto: RegisterCourseDto) {
    return this.progress.registerCourse(dto);
  }

  @Post('lessons/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark a lesson complete for a learner' })
  completeLesson(@Body() dto: CompleteLessonDto) {
    return this.progress.completeLesson(dto.userId, dto.courseId, dto.lessonId);
  }

  @Post('tasks/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark a task complete for a learner and award its XP' })
  completeTask(@Body() dto: CompleteTaskDto) {
    return this.progress.completeTask(dto.userId, dto.courseId, dto.taskId);
  }

  @Get('users/:userId/courses/:courseId')
  @ApiOperation({ summary: "Get a learner's progress in one course" })
  getCourseProgress(@Param('userId') userId: string, @Param('courseId') courseId: string) {
    return this.progress.getCourseProgress(userId, courseId);
  }

  @Get('users/:userId/dashboard')
  @ApiOperation({ summary: 'Aggregate progress, XP and certificates for the learner dashboard' })
  getDashboard(@Param('userId') userId: string) {
    return this.progress.getDashboard(userId);
  }

  @Get('users/:userId/certificates')
  @ApiOperation({ summary: "List a learner's certificate eligibility records" })
  getCertificates(@Param('userId') userId: string) {
    return { userId, certificates: this.progress.listCertificates(userId) };
  }
}
