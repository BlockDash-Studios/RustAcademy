import { Module } from '@nestjs/common';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';
import { CoursesController } from './courses.controller';
import { CourseService } from './course.service';
import { LessonService } from './lesson.service';
import { EnrollmentService } from './enrollment.service';

/**
 * Learning Academy — Courses, Lessons, Enrollment (BE-041) and
 * Quizzes with auto-grading and attempt limits (BE-039).
 *
 * All providers are stateful in-memory, consistent with the
 * pattern used by GamificationModule, SocialModule, etc.
 */
@Module({
  controllers: [CoursesController, QuizController],
  providers: [CourseService, LessonService, EnrollmentService, QuizService],
  exports: [CourseService, LessonService, EnrollmentService, QuizService],
})
export class CoursesModule {}