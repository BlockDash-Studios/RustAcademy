import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DomainEventBus } from '../gamification/domain-event-bus';
import { XpService } from '../gamification/xp.service';
import {
  CertificateEligibility,
  CourseCompletion,
  CourseContent,
  LearnerCourseProgress,
  LearnerDashboard,
} from './progress.types';

/**
 * Per-learner progress tracking (BE-038).
 *
 * In-memory like `XpService` and `FollowService`, so the storage can be swapped
 * for a repository later without changing callers.
 *
 * XP is not priced here: completing a task publishes a `task.passed` event on
 * the existing `DomainEventBus`, and the completion transition publishes
 * `course.completed`, so `XpService` remains the one place that values and
 * records XP. The per-course `xpEarned` figure is read back from that ledger by
 * `courseId`.
 */
@Injectable()
export class ProgressService {
  private readonly courses = new Map<string, CourseContent>();
  /** `userId|courseId` → completed lesson ids. */
  private readonly completedLessons = new Map<string, Set<string>>();
  /** `userId|courseId` → completed task ids. */
  private readonly completedTasks = new Map<string, Set<string>>();
  /** `userId|courseId` → course completion record. */
  private readonly completions = new Map<string, CourseCompletion>();
  /** `userId|courseId` → certificate issued at the completion transition. */
  private readonly certificates = new Map<string, CertificateEligibility>();

  private nextCertificateId = 1;

  constructor(
    private readonly eventBus: DomainEventBus,
    private readonly xpService: XpService,
  ) {}

  // ── Course content manifest ───────────────────────────────────────────────

  /**
   * Registers the lessons and tasks a course expects a learner to finish.
   *
   * A course with no lessons or no tasks could never satisfy "all lessons and
   * tasks complete", so that manifest is rejected up front.
   */
  registerCourse(input: CourseContent): CourseContent {
    if (this.courses.has(input.courseId)) {
      throw new ConflictException(`Course "${input.courseId}" is already registered`);
    }

    const lessonIds = [...new Set(input.lessonIds ?? [])];
    const taskIds = [...new Set(input.taskIds ?? [])];
    if (lessonIds.length === 0 || taskIds.length === 0) {
      throw new BadRequestException({
        error:
          `Course "${input.courseId}" needs at least one lesson and one task ` +
          `(has ${lessonIds.length} lesson(s), ${taskIds.length} task(s))`,
        code: 'INSUFFICIENT_COURSE_CONTENT',
      });
    }

    const course: CourseContent = { courseId: input.courseId, lessonIds, taskIds };
    this.courses.set(course.courseId, course);
    return course;
  }

  getCourse(courseId: string): CourseContent {
    const course = this.courses.get(courseId);
    if (!course) throw new NotFoundException(`Course "${courseId}" not found`);
    return course;
  }

  listCourses(): CourseContent[] {
    return [...this.courses.values()];
  }

  // ── Completion ────────────────────────────────────────────────────────────

  /** Marks a lesson complete and returns the learner's refreshed course progress. */
  completeLesson(userId: string, courseId: string, lessonId: string): LearnerCourseProgress {
    const course = this.getCourse(courseId);
    if (!course.lessonIds.includes(lessonId)) {
      throw new NotFoundException(`Lesson "${lessonId}" not found in course "${courseId}"`);
    }

    const key = this.progressKey(userId, courseId);
    const completed = this.completedLessons.get(key) ?? new Set<string>();
    if (completed.has(lessonId)) {
      throw new BadRequestException(`Lesson "${lessonId}" is already completed for user "${userId}"`);
    }
    completed.add(lessonId);
    this.completedLessons.set(key, completed);

    this.evaluateCompletion(userId, courseId);
    return this.getCourseProgress(userId, courseId);
  }

  /** Marks a task complete, awards its XP, and refreshes course progress. */
  completeTask(userId: string, courseId: string, taskId: string): LearnerCourseProgress {
    const course = this.getCourse(courseId);
    if (!course.taskIds.includes(taskId)) {
      throw new NotFoundException(`Task "${taskId}" not found in course "${courseId}"`);
    }

    const key = this.progressKey(userId, courseId);
    const completed = this.completedTasks.get(key) ?? new Set<string>();
    if (completed.has(taskId)) {
      throw new BadRequestException(`Task "${taskId}" is already completed for user "${userId}"`);
    }
    completed.add(taskId);
    this.completedTasks.set(key, completed);

    // Task completion is what earns XP in the academy's XP model. The
    // deterministic eventId keeps a replayed call from double-crediting.
    this.eventBus.publish({
      eventId: `progress:${userId}:${courseId}:task:${taskId}`,
      userId,
      type: 'task.passed',
      metadata: { courseId, taskId, source: 'progress' },
    });

    this.evaluateCompletion(userId, courseId);
    return this.getCourseProgress(userId, courseId);
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  getCourseProgress(userId: string, courseId: string): LearnerCourseProgress {
    const course = this.getCourse(courseId);
    const key = this.progressKey(userId, courseId);

    const lessonsCompleted = this.completedLessons.get(key)?.size ?? 0;
    const tasksCompleted = this.completedTasks.get(key)?.size ?? 0;
    const completion = this.completions.get(key);
    const certificate = this.certificates.get(key);

    return {
      userId,
      courseId,
      lessonsCompleted,
      lessonsTotal: course.lessonIds.length,
      lessonCompletionPercent: toPercent(lessonsCompleted, course.lessonIds.length),
      tasksCompleted,
      tasksTotal: course.taskIds.length,
      taskCompletionPercent: toPercent(tasksCompleted, course.taskIds.length),
      xpEarned: this.getCourseXp(userId, courseId),
      completed: Boolean(completion),
      completedAt: completion?.completedAt,
      certificateEligible: Boolean(certificate),
      certificate,
    };
  }

  getDashboard(userId: string): LearnerDashboard {
    const courses = this.listCourses()
      .filter((course) => this.hasProgress(userId, course.courseId))
      .map((course) => this.getCourseProgress(userId, course.courseId));

    return {
      userId,
      totalXp: this.xpService.getBalance(userId),
      coursesInProgress: courses.filter((course) => !course.completed).length,
      coursesCompleted: courses.filter((course) => course.completed).length,
      certificates: this.listCertificates(userId),
      courses,
    };
  }

  getCertificate(userId: string, courseId: string): CertificateEligibility | undefined {
    return this.certificates.get(this.progressKey(userId, courseId));
  }

  listCertificates(userId: string): CertificateEligibility[] {
    return [...this.certificates.values()].filter((certificate) => certificate.userId === userId);
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /**
   * Flips the course to complete exactly once, when every lesson and task has
   * been finished. That single transition publishes `course.completed` (the
   * 100 XP bonus) and records certificate eligibility.
   */
  private evaluateCompletion(userId: string, courseId: string): void {
    const course = this.getCourse(courseId);
    const key = this.progressKey(userId, courseId);

    const lessonsDone = this.completedLessons.get(key)?.size ?? 0;
    const tasksDone = this.completedTasks.get(key)?.size ?? 0;
    if (lessonsDone < course.lessonIds.length || tasksDone < course.taskIds.length) return;
    if (this.completions.has(key)) return;

    const completedAt = new Date().toISOString();
    this.completions.set(key, { userId, courseId, completedAt });

    this.eventBus.publish({
      eventId: `progress:${userId}:${courseId}:course.completed`,
      userId,
      type: 'course.completed',
      occurredAt: completedAt,
      metadata: { courseId, source: 'progress' },
    });

    this.certificates.set(key, {
      certificateId: `cert_${this.nextCertificateId++}`,
      userId,
      courseId,
      status: 'eligible',
      eligibleAt: completedAt,
    });
  }

  /** A course shows up on the dashboard once the learner has started it. */
  private hasProgress(userId: string, courseId: string): boolean {
    const key = this.progressKey(userId, courseId);
    return (
      (this.completedLessons.get(key)?.size ?? 0) > 0 ||
      (this.completedTasks.get(key)?.size ?? 0) > 0
    );
  }

  private getCourseXp(userId: string, courseId: string): number {
    return this.xpService
      .getLedger(userId)
      .filter((entry) => String((entry.metadata ?? {}).courseId) === courseId)
      .reduce((total, entry) => total + entry.points, 0);
  }

  private progressKey(userId: string, courseId: string): string {
    return `${userId}|${courseId}`;
  }
}

/** Rounded integer percentage; 0 when a course has no items of that kind. */
function toPercent(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}
