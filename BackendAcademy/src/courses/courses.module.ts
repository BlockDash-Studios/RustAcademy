import { Module } from '@nestjs/common';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';
import { CoursesController, LegacyCoursesController } from './courses.controller';
import { CourseService } from './course.service';
import { CoursesService } from './courses.service';
import { LessonService } from './lesson.service';
import { EnrollmentService } from './enrollment.service';

/**
 * Learning Academy — Courses, Lessons, Enrollment (BE-041) and
 * Quizzes with auto-grading and attempt limits (BE-039).
 *
 * All providers are stateful in-memory, consistent with the
 * pattern used by GamificationModule, SocialModule, etc.
 *
 * `LegacyCoursesController` + `CoursesService` keep the original
 * capacity-tracked enrollment/task-submission surface (`/api/courses`) that
 * the e2e contract exercises.
 */
@Module({
  controllers: [CoursesController, LegacyCoursesController, QuizController],
  providers: [CourseService, CoursesService, LessonService, EnrollmentService, QuizService],
  exports: [CourseService, CoursesService, LessonService, EnrollmentService, QuizService],
})
export class CoursesModule {}
