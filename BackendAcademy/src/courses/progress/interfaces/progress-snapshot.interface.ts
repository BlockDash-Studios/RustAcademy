import { CourseLevel } from '../../interfaces/course-level.enum';

/**
 * Aggregated progress for a single course within a learner's snapshot.
 * `totalLessons` / `totalTasks` are populated when the course is registered
 * with the progress service; until then we fall back to the raw counts
 * relative to what has been completed.
 */
export interface ICourseSnapshot {
  courseId: string;
  title: string;
  level: CourseLevel;
  learningPathId: string;
  status: CourseProgressStatus;
  completionPercent: number;
  lessonsCompleted: number;
  totalLessons: number;
  tasksCompleted: number;
  totalTasks: number;
  xpEarned: number;
  xpAvailable: number;
  startedAt: Date;
  lastActivityAt: Date | null;
  completedAt: Date | null;
  /**
   * Hint for UI "continue where you left off" affordances. Returns the
   * first lesson id the learner recorded as completed for this course.
   * Uses JavaScript Set insertion order, so when learners complete
   * lessons sequentially it matches the chronological first;
   * intentionally NOT a lesson-index lookup.
   */
  firstCompletedLessonId: string | null;
}

export interface IOverallSnapshot {
  totalXp: number;
  coursesCompleted: number;
  coursesInProgress: number;
  lessonsCompleted: number;
  tasksCompleted: number;
  lastActiveAt: Date | null;
}

export interface IProgressSnapshot {
  userId: string;
  generatedAt: Date;
  overall: IOverallSnapshot;
  courses: ICourseSnapshot[];
}

export enum CourseProgressStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}
