import { Injectable, NotFoundException } from '@nestjs/common';
import { CourseEntity } from '../course.entity';
import { CourseService } from '../course.service';
import { RegisterCourseProgressDto } from './dto/register-course-progress.dto';
import {
  RecordLessonCompletionDto,
  RecordTaskCompletionDto,
} from './dto/record-completion.dto';
import {
  CourseProgressStatus,
  ICourseSnapshot,
  IOverallSnapshot,
  IProgressSnapshot,
} from './interfaces/progress-snapshot.interface';

/**
 * Weight applied to lesson completion and task completion when deriving
 * the `completionPercent` field on the snapshot. Lessons are weighted
 * higher because they represent the primary learning surface; tasks are
 * treated as supplementary assessments.
 */
const LESSON_COMPLETION_WEIGHT = 0.7;
const TASK_COMPLETION_WEIGHT = 0.3;

interface CourseProgressRecord {
  courseId: string;
  totalLessons: number;
  totalTasks: number;
  completedLessonIds: Set<string>;
  completedTaskIds: Set<string>;
  xpEarned: number;
  startedAt: Date;
  lastActivityAt: Date | null;
  completedAt: Date | null;
}

interface LearnerProgressRecord {
  userId: string;
  courses: Map<string, CourseProgressRecord>;
}

/**
 * In-memory store for learner progress snapshots, scoped to the courses
 * module. Uses CourseService to hydrate course metadata (title, level,
 * learningPathId, xpReward) on the snapshot. The service is intentionally
 * self-contained so the courses feature remains easy to evolve in isolation.
 */
@Injectable()
export class ProgressService {
  private readonly learners: Map<string, LearnerProgressRecord> = new Map();

  constructor(private readonly courseService: CourseService) {}

  /**
   * Register that a learner is enrolled in a course and (optionally) lock
   * in the totals used to compute completion percentages.
   *
   * Behaviour for re-registration:
   *  - `startedAt` is preserved.
   *  - `totalLessons` / `totalTasks` are only updated when the call site
   *    supplies an explicit value (including `0`). Omitting a field keeps
   *    the previously registered value.
   *  - Previously recorded lesson/task completions are NEVER cleared.
   */
  async registerCourse(
    userId: string,
    dto: RegisterCourseProgressDto,
  ): Promise<CourseProgressRecord> {
    const course = await this.courseService.findById(dto.courseId);
    if (!course) {
      throw new NotFoundException(`Course ${dto.courseId} not found`);
    }

    const learner = this.ensureLearner(userId);
    const existing = learner.courses.get(dto.courseId);

    if (existing) {
      if (dto.totalLessons !== undefined) existing.totalLessons = dto.totalLessons;
      if (dto.totalTasks !== undefined) existing.totalTasks = dto.totalTasks;
      return existing;
    }

    const record: CourseProgressRecord = {
      courseId: dto.courseId,
      totalLessons: dto.totalLessons ?? 0,
      totalTasks: dto.totalTasks ?? 0,
      completedLessonIds: new Set(),
      completedTaskIds: new Set(),
      xpEarned: 0,
      startedAt: new Date(),
      lastActivityAt: null,
      completedAt: null,
    };

    learner.courses.set(dto.courseId, record);
    return record;
  }

  /**
   * Record a lesson completion for (user, course). Repeating the same
   * lesson id is a no-op for counters/xp but always refreshes the
   * lastActivityAt timestamp.
   */
  async recordLessonCompletion(
    userId: string,
    courseId: string,
    dto: RecordLessonCompletionDto,
  ): Promise<CourseProgressRecord> {
    const record = await this.ensureCourseRecord(userId, courseId);

    const xp = dto.xpEarned ?? 0;
    if (!record.completedLessonIds.has(dto.lessonId)) {
      record.completedLessonIds.add(dto.lessonId);
      record.xpEarned += xp;
    }
    record.lastActivityAt = new Date();
    this.maybeMarkCompleted(record);
    return record;
  }

  /**
   * Record a task completion for (user, course).
   */
  async recordTaskCompletion(
    userId: string,
    courseId: string,
    dto: RecordTaskCompletionDto,
  ): Promise<CourseProgressRecord> {
    const record = await this.ensureCourseRecord(userId, courseId);

    const xp = dto.xpEarned ?? 0;
    if (!record.completedTaskIds.has(dto.taskId)) {
      record.completedTaskIds.add(dto.taskId);
      record.xpEarned += xp;
    }
    record.lastActivityAt = new Date();
    this.maybeMarkCompleted(record);
    return record;
  }

  /**
   * Compute the full snapshot for a learner, aggregating per-course state
   * into overall totals and resolving course metadata via CourseService.
   */
  async getSnapshot(userId: string): Promise<IProgressSnapshot> {
    const learner = this.learners.get(userId);

    const overall: IOverallSnapshot = {
      totalXp: 0,
      coursesCompleted: 0,
      coursesInProgress: 0,
      lessonsCompleted: 0,
      tasksCompleted: 0,
      lastActiveAt: null,
    };

    if (!learner) {
      return {
        userId,
        generatedAt: new Date(),
        overall,
        courses: [],
      };
    }

    const courses: ICourseSnapshot[] = [];
    let latestActivity: Date | null = null;

    for (const record of learner.courses.values()) {
      const course = await this.courseService.findById(record.courseId);
      if (!course) {
        continue;
      }

      const status = this.computeStatus(record);
      const completionPercent = this.computeCompletionPercent(record);

      if (status === CourseProgressStatus.COMPLETED) {
        overall.coursesCompleted += 1;
      } else if (
        record.completedLessonIds.size > 0 ||
        record.completedTaskIds.size > 0
      ) {
        overall.coursesInProgress += 1;
      }

      overall.totalXp += record.xpEarned;
      overall.lessonsCompleted += record.completedLessonIds.size;
      overall.tasksCompleted += record.completedTaskIds.size;

      if (record.lastActivityAt) {
        if (!latestActivity || record.lastActivityAt > latestActivity) {
          latestActivity = record.lastActivityAt;
        }
      }

      courses.push(this.buildCourseSnapshot(record, course, status, completionPercent));
    }

    overall.lastActiveAt = latestActivity;
    courses.sort((a, b) => {
      // Push untouched (NOT_STARTED) courses to the end so consumers see
      // active work first. Among touched courses, sort by most recent
      // activity; ties fall back to a stable id-based comparator.
      const aUntouched = a.lastActivityAt == null;
      const bUntouched = b.lastActivityAt == null;
      if (aUntouched !== bUntouched) {
        return aUntouched ? 1 : -1;
      }
      const aTs = a.lastActivityAt?.getTime() ?? 0;
      const bTs = b.lastActivityAt?.getTime() ?? 0;
      if (bTs !== aTs) return bTs - aTs;
      return a.courseId.localeCompare(b.courseId);
    });

    return {
      userId,
      generatedAt: new Date(),
      overall,
      courses,
    };
  }

  /**
   * Compute the snapshot for a single (user, course) pair. Returns null when
   * the learner has no progress row for that course so callers can distinguish
   * "no progress yet" from "progress exists".
   */
  async getCourseSnapshot(
    userId: string,
    courseId: string,
  ): Promise<ICourseSnapshot | null> {
    const learner = this.learners.get(userId);
    const record = learner?.courses.get(courseId);
    if (!record) return null;

    const course = await this.courseService.findById(courseId);
    if (!course) return null;

    const status = this.computeStatus(record);
    const completionPercent = this.computeCompletionPercent(record);
    return this.buildCourseSnapshot(record, course, status, completionPercent);
  }

  /**
   * Remove all progress for a learner. Useful for tests and admin tooling.
   */
  async resetLearner(userId: string): Promise<boolean> {
    return this.learners.delete(userId);
  }

  // ------------------ internals ------------------

  private ensureLearner(userId: string): LearnerProgressRecord {
    let learner = this.learners.get(userId);
    if (!learner) {
      learner = { userId, courses: new Map() };
      this.learners.set(userId, learner);
    }
    return learner;
  }

  private async ensureCourseRecord(
    userId: string,
    courseId: string,
  ): Promise<CourseProgressRecord> {
    const learner = this.ensureLearner(userId);
    const existing = learner.courses.get(courseId);
    if (existing) return existing;

    // Auto-register so completion recordings never require a separate
    // register call. Totals stay at 0 until the caller provides them.
    return this.registerCourse(userId, { courseId });
  }

  private maybeMarkCompleted(record: CourseProgressRecord): void {
    if (record.totalLessons === 0 && record.totalTasks === 0) {
      // No totals registered - we can't know if it's "completed".
      record.completedAt = null;
      return;
    }

    const lessonsTargetMet =
      record.totalLessons === 0 ||
      record.completedLessonIds.size >= record.totalLessons;
    const tasksTargetMet =
      record.totalTasks === 0 ||
      record.completedTaskIds.size >= record.totalTasks;

    if (lessonsTargetMet && tasksTargetMet && !record.completedAt) {
      record.completedAt = new Date();
    } else if (!lessonsTargetMet || !tasksTargetMet) {
      record.completedAt = null;
    }
  }

  private computeStatus(record: CourseProgressRecord): CourseProgressStatus {
    if (record.completedAt) return CourseProgressStatus.COMPLETED;
    if (
      record.completedLessonIds.size > 0 ||
      record.completedTaskIds.size > 0
    ) {
      return CourseProgressStatus.IN_PROGRESS;
    }
    return CourseProgressStatus.NOT_STARTED;
  }

  private computeCompletionPercent(record: CourseProgressRecord): number {
    const weightLesson = record.totalLessons > 0 ? LESSON_COMPLETION_WEIGHT : 0;
    const weightTask = record.totalTasks > 0 ? TASK_COMPLETION_WEIGHT : 0;
    const totalWeight = weightLesson + weightTask;

    // If neither weight is known we report 0% rather than dividing by zero.
    if (totalWeight === 0) return 0;

    const lessonPart =
      record.totalLessons > 0
        ? record.completedLessonIds.size / record.totalLessons
        : 0;
    const taskPart =
      record.totalTasks > 0
        ? record.completedTaskIds.size / record.totalTasks
        : 0;

    const ratio = (lessonPart * weightLesson + taskPart * weightTask) / totalWeight;
    return Math.max(0, Math.min(100, Math.round(ratio * 100)));
  }

  private buildCourseSnapshot(
    record: CourseProgressRecord,
    course: CourseEntity,
    status: CourseProgressStatus,
    completionPercent: number,
  ): ICourseSnapshot {
    return {
      courseId: record.courseId,
      title: course.title,
      level: course.level,
      learningPathId: course.learningPathId,
      status,
      completionPercent,
      lessonsCompleted: record.completedLessonIds.size,
      totalLessons: record.totalLessons,
      tasksCompleted: record.completedTaskIds.size,
      totalTasks: record.totalTasks,
      xpEarned: record.xpEarned,
      xpAvailable: course.xpReward,
      startedAt: record.startedAt,
      lastActivityAt: record.lastActivityAt,
      completedAt: record.completedAt,
      firstCompletedLessonId: this.findFirstCompletedLessonId(record),
    };
  }

  /**
   * Returns the first lesson the learner recorded as completed for the
   * given course. JavaScript Set iteration order is insertion order, so
   * when learners record completions sequentially the result matches the
   * chronological first; this is NOT a lesson-index lookup.
   */
  private findFirstCompletedLessonId(record: CourseProgressRecord): string | null {
    if (record.completedLessonIds.size === 0) return null;
    const [first] = record.completedLessonIds;
    return first ?? null;
  }
}
