/**
 * Domain types for the Learning Academy — Courses, Lessons, Enrollment (BE-041).
 *
 * Prerequisites are stored as an ordered array of courseIds / lessonIds on each
 * entity. The enrollment service walks these arrays and rejects the operation
 * with 409 Conflict when any prerequisite has not been completed.
 *
 * Design notes
 * ─────────────
 * • Prerequisites are plain string IDs, not foreign-key objects, so the type
 *   layer stays decoupled from any future persistence adapter.
 * • `completedAt` on an Enrollment is the authoritative "done" signal used by
 *   the prerequisite check. An enrollment with `completedAt === undefined` is
 *   still in progress.
 * • The same pattern is applied at both the course level ("complete Course A
 *   before enrolling in Course B") and the lesson level ("complete Lesson 1
 *   before starting Lesson 2").
 */

// ── Course ──────────────────────────────────────────────────────────────────

export interface Course {
  courseId: string;
  title: string;
  description: string;
  /**
   * Ordered list of courseIds that a learner must have completed before they
   * can enrol in this course (e.g. ["ownership-101"] before "lifetimes-201").
   */
  prerequisiteCourseIds: string[];
  createdAt: string;
}

// ── Lesson ──────────────────────────────────────────────────────────────────

export interface Lesson {
  lessonId: string;
  courseId: string;
  title: string;
  order: number;
  /**
   * Ordered list of lessonIds (within the same course) that must be completed
   * before this lesson can be started.
   */
  prerequisiteLessonIds: string[];
  createdAt: string;
}

// ── Enrollment ──────────────────────────────────────────────────────────────

export interface Enrollment {
  enrollmentId: string;
  userId: string;
  courseId: string;
  enrolledAt: string;
  /** ISO-8601 timestamp; present when the learner finished the course. */
  completedAt?: string;
}

// ── Lesson Progress ─────────────────────────────────────────────────────────

export interface LessonProgress {
  progressId: string;
  userId: string;
  lessonId: string;
  courseId: string;
  startedAt: string;
  /** ISO-8601 timestamp; present when the learner completed the lesson. */
  completedAt?: string;
}

// ── Error payload shape returned for 409 responses ─────────────────────────

export interface PrerequisiteError {
  code: 'PREREQUISITES_NOT_MET';
  message: string;
  /** The specific prerequisite IDs that are not yet satisfied. */
  unmetPrerequisiteIds: string[];
}
