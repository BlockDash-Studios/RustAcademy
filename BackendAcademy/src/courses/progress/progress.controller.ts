import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { RegisterCourseProgressDto } from './dto/register-course-progress.dto';
import {
  RecordLessonCompletionDto,
  RecordTaskCompletionDto,
} from './dto/record-completion.dto';
import {
  ICourseSnapshot,
  IProgressSnapshot,
} from './interfaces/progress-snapshot.interface';
import { ProgressService } from './progress.service';

@Controller('courses/progress')
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  /**
   * GET /courses/progress/snapshot/:userId
   * Returns the aggregated snapshot covering every course the learner has
   * touched, sorted by most recently active.
   */
  @Get('snapshot/:userId')
  async getSnapshot(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<IProgressSnapshot> {
    return this.progressService.getSnapshot(userId);
  }

  /**
   * GET /courses/progress/snapshot/:userId/course/:courseId
   * Returns the snapshot scoped to a single course, or 404 when the learner
   * has no progress row for the course yet.
   */
  @Get('snapshot/:userId/course/:courseId')
  async getCourseSnapshot(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
  ): Promise<ICourseSnapshot> {
    const snapshot = await this.progressService.getCourseSnapshot(userId, courseId);
    if (!snapshot) {
      throw new NotFoundException(
        `No progress recorded for user ${userId} on course ${courseId}`,
      );
    }
    return snapshot;
  }

  /**
   * POST /courses/progress/:userId/courses
   * Register a learner's enrollment in a course, optionally with the known
   * lesson / task totals so completion percentages are meaningful.
   */
  @Post(':userId/courses')
  async registerCourse(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: RegisterCourseProgressDto,
  ) {
    return this.progressService.registerCourse(userId, dto);
  }

  /**
   * PUT /courses/progress/:userId/courses/:courseId/lessons
   * Record that the learner completed a lesson in the given course.
   */
  @Put(':userId/courses/:courseId/lessons')
  async completeLesson(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: RecordLessonCompletionDto,
  ) {
    return this.progressService.recordLessonCompletion(userId, courseId, dto);
  }

  /**
   * PUT /courses/progress/:userId/courses/:courseId/tasks
   * Record that the learner completed a task in the given course.
   */
  @Put(':userId/courses/:courseId/tasks')
  async completeTask(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: RecordTaskCompletionDto,
  ) {
    return this.progressService.recordTaskCompletion(userId, courseId, dto);
  }

  /**
   * DELETE /courses/progress/:userId
   * Wipe the learner's snapshot. Primarily intended for tests and admin ops.
   */
  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reset(@Param('userId', ParseUUIDPipe) userId: string): Promise<void> {
    await this.progressService.resetLearner(userId);
  }
}
