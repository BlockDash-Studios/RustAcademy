import { Module } from '@nestjs/common';
import { CourseService } from './course.service';
import { LessonService } from './lesson.service';
import { EnrollmentService } from './enrollment.service';
import { CoursesController } from './courses.controller';

/**
 * Learning Academy — Courses, Lessons & Prerequisite Enrollment (BE-041).
 *
 * All three services are stateful in-memory providers, consistent with the
 * pattern used by GamificationModule, SocialModule, etc.
 */
@Module({
  controllers: [CoursesController],
  providers: [CourseService, LessonService, EnrollmentService],
  exports: [CourseService, LessonService, EnrollmentService],
})
export class CoursesModule {}
