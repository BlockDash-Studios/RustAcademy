/**
 * Domain types for per-learner progress tracking (BE-038).
 *
 * A course is described by a lightweight content manifest — the lesson ids and
 * task ids that make it up. `ProgressService` stores that manifest rather than
 * owning a course entity, so the Learning Academy's course/lesson/task module
 * stays the single source of truth for content and simply registers what a
 * learner is expected to finish.
 *
 * Completion rule
 * ───────────────
 * A learner completes a course once *every* lesson and *every* task in the
 * manifest has been completed. That one transition is what makes the learner
 * eligible for a certificate and is the only place the `course.completed` XP
 * bonus is published.
 */

export interface CourseContent {
  courseId: string;
  /** Lesson ids that make up the course (unique). */
  lessonIds: string[];
  /** Task ids that make up the course (unique). */
  taskIds: string[];
}

/** Recorded once, the first time a learner finishes every lesson and task. */
export interface CourseCompletion {
  userId: string;
  courseId: string;
  completedAt: string;
}

/** Certificate eligibility issued by the course-completion transition. */
export interface CertificateEligibility {
  certificateId: string;
  userId: string;
  courseId: string;
  status: 'eligible';
  eligibleAt: string;
}

/** Per-learner progress for a single course. */
export interface LearnerCourseProgress {
  userId: string;
  courseId: string;
  lessonsCompleted: number;
  lessonsTotal: number;
  /** 0–100, rounded to the nearest integer. */
  lessonCompletionPercent: number;
  tasksCompleted: number;
  tasksTotal: number;
  /** 0–100, rounded to the nearest integer. */
  taskCompletionPercent: number;
  /** XP earned in this course, read back from the gamification ledger. */
  xpEarned: number;
  /** True once every lesson and task is complete. */
  completed: boolean;
  completedAt?: string;
  /** True when the completion transition has issued a certificate. */
  certificateEligible: boolean;
  certificate?: CertificateEligibility;
}

/** Aggregate payload backing the learner dashboard. */
export interface LearnerDashboard {
  userId: string;
  totalXp: number;
  coursesInProgress: number;
  coursesCompleted: number;
  certificates: CertificateEligibility[];
  courses: LearnerCourseProgress[];
}
