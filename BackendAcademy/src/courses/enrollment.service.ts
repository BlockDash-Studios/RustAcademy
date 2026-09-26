import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CourseService } from './course.service';
import { LessonService } from './lesson.service';
import { Enrollment, LessonProgress, PrerequisiteError } from './course.types';

/**
 * Enrollment and lesson-progress service (BE-041).
 *
 * ── Prerequisite enforcement ────────────────────────────────────────────────
 *
 * Course-level:
 *   Before `enroll()` is allowed, every courseId in
 *   `course.prerequisiteCourseIds` must already have a completed enrollment
 *   for that user (i.e. `enrollment.completedAt` is set).
 *
 * Lesson-level:
 *   Before `startLesson()` is allowed, every lessonId in
 *   `lesson.prerequisiteLessonIds` must already have a completed progress
 *   record for that user.
 *
 * When prerequisites are unmet the service throws a `ConflictException` (409)
 * with a structured body describing exactly which prerequisite IDs are missing.
 *
 * ── Error body shape ────────────────────────────────────────────────────────
 *
 *   {
 *     "statusCode": 409,
 *     "error": "Conflict",
 *     "message": "Prerequisites not met for course \"lifetimes-201\"",
 *     "code": "PREREQUISITES_NOT_MET",
 *     "unmetPrerequisiteIds": ["ownership-101"]
 *   }
 */
@Injectable()
export class EnrollmentService {
  /** userId → enrollments map, keyed by courseId for O(1) lookup. */
  private readonly enrollments = new Map<string, Map<string, Enrollment>>();
  /** userId → lesson progress map, keyed by lessonId for O(1) lookup. */
  private readonly progress = new Map<string, Map<string, LessonProgress>>();

  private nextEnrollmentId = 1;
  private nextProgressId = 1;

  constructor(
    private readonly courseService: CourseService,
    private readonly lessonService: LessonService,
  ) {}

  // ── Course enrollment ────────────────────────────────────────────────────

  /**
   * Enrols a user in a course.
   *
   * Throws:
   *  • 404 NotFoundException   — course not found
   *  • 400 BadRequestException — user is already enrolled
   *  • 409 ConflictException   — one or more prerequisite courses not completed
   */
  enroll(userId: string, courseId: string): Enrollment {
    const course = this.courseService.findById(courseId);

    const userEnrollments = this.enrollments.get(userId) ?? new Map<string, Enrollment>();

    if (userEnrollments.has(courseId)) {
      throw new BadRequestException(
        `User "${userId}" is already enrolled in course "${courseId}"`,
      );
    }

    // ── prerequisite check ───────────────────────────────────────────────
    const unmet = course.prerequisiteCourseIds.filter((prereqId) => {
      const prereqEnrollment = userEnrollments.get(prereqId);
      // A prerequisite is satisfied only when the user has a *completed* enrollment.
      return !prereqEnrollment?.completedAt;
    });

    if (unmet.length > 0) {
      const errorPayload: PrerequisiteError = {
        code: 'PREREQUISITES_NOT_MET',
        message: `Prerequisites not met for course "${courseId}": complete ${unmet.join(', ')} first`,
        unmetPrerequisiteIds: unmet,
      };
      throw new ConflictException(errorPayload);
    }

    const enrollment: Enrollment = {
      enrollmentId: `enr_${this.nextEnrollmentId++}`,
      userId,
      courseId,
      enrolledAt: new Date().toISOString(),
    };

    userEnrollments.set(courseId, enrollment);
    this.enrollments.set(userId, userEnrollments);
    return enrollment;
  }

  /**
   * Marks a user's enrollment in a course as completed.
   *
   * Throws:
   *  • 404 NotFoundException   — enrollment not found
   *  • 400 BadRequestException — already completed
   */
  completeCourse(userId: string, courseId: string): Enrollment {
    const enrollment = this.getEnrollmentOrThrow(userId, courseId);

    if (enrollment.completedAt) {
      throw new BadRequestException(
        `User "${userId}" has already completed course "${courseId}"`,
      );
    }

    enrollment.completedAt = new Date().toISOString();
    return enrollment;
  }

  getEnrollment(userId: string, courseId: string): Enrollment | undefined {
    return this.enrollments.get(userId)?.get(courseId);
  }

  listEnrollments(userId: string): Enrollment[] {
    return [...(this.enrollments.get(userId)?.values() ?? [])];
  }

  // ── Lesson progress ──────────────────────────────────────────────────────

  /**
   * Starts a lesson for a user.
   *
   * The user must already be enrolled in the parent course. Every lessonId
   * listed in `lesson.prerequisiteLessonIds` must have a completed progress
   * record.
   *
   * Throws:
   *  • 404 NotFoundException   — lesson not found
   *  • 400 BadRequestException — not enrolled in the course / already started
   *  • 409 ConflictException   — prerequisite lessons not yet completed
   */
  startLesson(userId: string, lessonId: string): LessonProgress {
    const lesson = this.lessonService.findById(lessonId);

    // Must be enrolled in the parent course.
    const enrollment = this.getEnrollment(userId, lesson.courseId);
    if (!enrollment) {
      throw new BadRequestException(
        `User "${userId}" is not enrolled in course "${lesson.courseId}". Enrol first.`,
      );
    }

    const userProgress = this.progress.get(userId) ?? new Map<string, LessonProgress>();

    if (userProgress.has(lessonId)) {
      throw new BadRequestException(
        `User "${userId}" has already started lesson "${lessonId}"`,
      );
    }

    // ── prerequisite check ───────────────────────────────────────────────
    const unmet = lesson.prerequisiteLessonIds.filter((prereqLessonId) => {
      const prereqProgress = userProgress.get(prereqLessonId);
      return !prereqProgress?.completedAt;
    });

    if (unmet.length > 0) {
      const errorPayload: PrerequisiteError = {
        code: 'PREREQUISITES_NOT_MET',
        message: `Prerequisites not met for lesson "${lessonId}": complete ${unmet.join(', ')} first`,
        unmetPrerequisiteIds: unmet,
      };
      throw new ConflictException(errorPayload);
    }

    const prog: LessonProgress = {
      progressId: `prog_${this.nextProgressId++}`,
      userId,
      lessonId,
      courseId: lesson.courseId,
      startedAt: new Date().toISOString(),
    };

    userProgress.set(lessonId, prog);
    this.progress.set(userId, userProgress);
    return prog;
  }

  /**
   * Marks a lesson as completed.
   *
   * Throws:
   *  • 404 NotFoundException   — progress record not found (lesson not started)
   *  • 400 BadRequestException — already completed
   */
  completeLesson(userId: string, lessonId: string): LessonProgress {
    const prog = this.getLessonProgressOrThrow(userId, lessonId);

    if (prog.completedAt) {
      throw new BadRequestException(
        `User "${userId}" has already completed lesson "${lessonId}"`,
      );
    }

    prog.completedAt = new Date().toISOString();
    return prog;
  }

  getLessonProgress(userId: string, lessonId: string): LessonProgress | undefined {
    return this.progress.get(userId)?.get(lessonId);
  }

  listLessonProgress(userId: string, courseId: string): LessonProgress[] {
    return [...(this.progress.get(userId)?.values() ?? [])].filter(
      (p) => p.courseId === courseId,
    );
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private getEnrollmentOrThrow(userId: string, courseId: string): Enrollment {
    const enrollment = this.enrollments.get(userId)?.get(courseId);
    if (!enrollment) {
      throw new NotFoundException(
        `No enrollment found for user "${userId}" in course "${courseId}"`,
      );
    }
    return enrollment;
  }

  private getLessonProgressOrThrow(userId: string, lessonId: string): LessonProgress {
    const prog = this.progress.get(userId)?.get(lessonId);
    if (!prog) {
      throw new NotFoundException(
        `No progress record found for user "${userId}" on lesson "${lessonId}". Start the lesson first.`,
      );
    }
    return prog;
  }
}
