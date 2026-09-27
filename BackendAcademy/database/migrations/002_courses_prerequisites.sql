-- Migration 002: Courses, Lessons & Prerequisite Chains (BE-041)
--
-- Adds the persistence schema for the Learning Academy module introduced by
-- EnrollmentService / CourseService / LessonService. The NestJS services are
-- currently in-memory; this schema is the authoritative durable representation
-- that a future repository layer will target.
--
-- Design notes
-- ─────────────
-- • prerequisite_course_ids / prerequisite_lesson_ids are stored as TEXT[]
--   (PostgreSQL native arrays). This avoids a separate join table while keeping
--   lookups simple; a JSONB column would work equally well if the array type is
--   unavailable on the target Supabase plan.
-- • course_enrollments.completed_at IS NULL means "in progress". Enforcement of
--   the prerequisite rule (must be NOT NULL) lives in the application layer
--   (EnrollmentService), not in a DB constraint, so partial enrollments are
--   legible in the data model.
-- • All tables use TEXT primary keys (slug / UUID) consistent with the existing
--   xp_ledger schema.

-- ── Courses ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS courses (
  course_id            TEXT PRIMARY KEY,
  title                TEXT NOT NULL,
  description          TEXT NOT NULL DEFAULT '',
  -- Ordered list of course_ids that must be completed before enrolling.
  prerequisite_course_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Lessons ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lessons (
  lesson_id                TEXT PRIMARY KEY,
  course_id                TEXT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
  title                    TEXT NOT NULL,
  -- 1-based position within the course; drives ordering in API responses.
  lesson_order             INTEGER NOT NULL CHECK (lesson_order >= 1),
  -- Ordered list of lesson_ids (same course) that must be completed first.
  prerequisite_lesson_ids  TEXT[] NOT NULL DEFAULT '{}',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, lesson_order)
);

CREATE INDEX IF NOT EXISTS lessons_course_id_idx ON lessons (course_id);

-- ── Course Enrollments ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS course_enrollments (
  enrollment_id TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  course_id     TEXT NOT NULL REFERENCES courses(course_id),
  enrolled_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- NULL = in progress; NOT NULL = completed. The application checks this column
  -- when deciding whether a prerequisite is satisfied.
  completed_at  TIMESTAMPTZ,
  UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS course_enrollments_user_id_idx ON course_enrollments (user_id);
CREATE INDEX IF NOT EXISTS course_enrollments_course_id_idx ON course_enrollments (course_id);

-- ── Lesson Progress ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lesson_progress (
  progress_id  TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  lesson_id    TEXT NOT NULL REFERENCES lessons(lesson_id),
  course_id    TEXT NOT NULL REFERENCES courses(course_id),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- NULL = in progress; NOT NULL = completed.
  completed_at TIMESTAMPTZ,
  UNIQUE (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS lesson_progress_user_course_idx ON lesson_progress (user_id, course_id);
