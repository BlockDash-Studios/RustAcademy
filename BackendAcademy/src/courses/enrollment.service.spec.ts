import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CourseService } from './course.service';
import { EnrollmentService } from './enrollment.service';
import { LessonService } from './lesson.service';

/**
 * Unit tests for BE-041 — Prerequisite Chains.
 *
 * Acceptance criteria: "Enrollment blocked with a helpful 409 when prerequisites unmet."
 */
describe('EnrollmentService — prerequisite chains (BE-041)', () => {
  let courseService: CourseService;
  let lessonService: LessonService;
  let enrollmentService: EnrollmentService;

  beforeEach(() => {
    courseService = new CourseService();
    lessonService = new LessonService();
    enrollmentService = new EnrollmentService(courseService, lessonService);
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  const makeCourse = (courseId: string, prereqs: string[] = []) =>
    courseService.create({
      courseId,
      title: `Title for ${courseId}`,
      description: 'Test course',
      prerequisiteCourseIds: prereqs,
    });

  const makeLesson = (lessonId: string, courseId: string, order: number, prereqs: string[] = []) =>
    lessonService.create({
      lessonId,
      courseId,
      title: `Title for ${lessonId}`,
      order,
      prerequisiteLessonIds: prereqs,
    });

  // ── Course enrollment — no prerequisites ─────────────────────────────────

  describe('course with no prerequisites', () => {
    it('allows enrollment immediately', () => {
      makeCourse('intro-rust-101');
      const enrollment = enrollmentService.enroll('user-1', 'intro-rust-101');

      expect(enrollment.userId).toBe('user-1');
      expect(enrollment.courseId).toBe('intro-rust-101');
      expect(enrollment.enrolledAt).toBeDefined();
      expect(enrollment.completedAt).toBeUndefined();
    });

    it('assigns a unique enrollmentId', () => {
      makeCourse('course-a');
      makeCourse('course-b');
      const e1 = enrollmentService.enroll('user-1', 'course-a');
      const e2 = enrollmentService.enroll('user-1', 'course-b');

      expect(e1.enrollmentId).not.toBe(e2.enrollmentId);
    });

    it('rejects enrollment in an unknown course with 404', () => {
      expect(() => enrollmentService.enroll('user-1', 'ghost-course')).toThrow(NotFoundException);
    });

    it('rejects duplicate enrollment with 400', () => {
      makeCourse('intro-rust-101');
      enrollmentService.enroll('user-1', 'intro-rust-101');

      expect(() => enrollmentService.enroll('user-1', 'intro-rust-101')).toThrow(BadRequestException);
    });
  });

  // ── Course enrollment — prerequisites enforced ───────────────────────────

  describe('course with prerequisite courses', () => {
    beforeEach(() => {
      makeCourse('ownership-101');
      makeCourse('lifetimes-201', ['ownership-101']);
    });

    it('blocks enrollment with 409 when prerequisite course not started', () => {
      let caught: ConflictException | undefined;
      try {
        enrollmentService.enroll('user-1', 'lifetimes-201');
      } catch (err) {
        caught = err as ConflictException;
      }

      expect(caught).toBeInstanceOf(ConflictException);
      expect(caught!.getStatus()).toBe(409);

      const body = caught!.getResponse() as Record<string, unknown>;
      expect(body.code).toBe('PREREQUISITES_NOT_MET');
      expect(body.unmetPrerequisiteIds).toEqual(['ownership-101']);
      expect(typeof body.message).toBe('string');
      expect(body.message).toContain('ownership-101');
    });

    it('blocks enrollment with 409 when prerequisite is enrolled but not completed', () => {
      enrollmentService.enroll('user-1', 'ownership-101');
      // Not calling completeCourse → still in progress

      let caught: ConflictException | undefined;
      try {
        enrollmentService.enroll('user-1', 'lifetimes-201');
      } catch (err) {
        caught = err as ConflictException;
      }

      expect(caught).toBeInstanceOf(ConflictException);
      const body = caught!.getResponse() as Record<string, unknown>;
      expect(body.code).toBe('PREREQUISITES_NOT_MET');
      expect(body.unmetPrerequisiteIds).toEqual(['ownership-101']);
    });

    it('allows enrollment once all prerequisite courses are completed', () => {
      enrollmentService.enroll('user-1', 'ownership-101');
      enrollmentService.completeCourse('user-1', 'ownership-101');

      const enrollment = enrollmentService.enroll('user-1', 'lifetimes-201');
      expect(enrollment.courseId).toBe('lifetimes-201');
    });
  });

  // ── Multi-prerequisite chain ─────────────────────────────────────────────

  describe('multi-hop prerequisite chain', () => {
    beforeEach(() => {
      makeCourse('intro-rust-101');
      makeCourse('ownership-101', ['intro-rust-101']);
      makeCourse('lifetimes-201', ['ownership-101']);
      makeCourse('advanced-async-301', ['ownership-101', 'lifetimes-201']);
    });

    it('lists ALL unmet prerequisite IDs in the 409 body', () => {
      // User has completed intro but neither ownership nor lifetimes.
      enrollmentService.enroll('user-1', 'intro-rust-101');
      enrollmentService.completeCourse('user-1', 'intro-rust-101');

      let caught: ConflictException | undefined;
      try {
        enrollmentService.enroll('user-1', 'advanced-async-301');
      } catch (err) {
        caught = err as ConflictException;
      }

      expect(caught).toBeInstanceOf(ConflictException);
      const body = caught!.getResponse() as Record<string, unknown>;
      expect(body.unmetPrerequisiteIds).toEqual(
        expect.arrayContaining(['ownership-101', 'lifetimes-201']),
      );
      expect((body.unmetPrerequisiteIds as string[]).length).toBe(2);
    });

    it('gates correctly when only one of two prerequisites is satisfied', () => {
      enrollmentService.enroll('user-1', 'intro-rust-101');
      enrollmentService.completeCourse('user-1', 'intro-rust-101');
      enrollmentService.enroll('user-1', 'ownership-101');
      enrollmentService.completeCourse('user-1', 'ownership-101');
      // Lifetimes not yet done.

      let caught: ConflictException | undefined;
      try {
        enrollmentService.enroll('user-1', 'advanced-async-301');
      } catch (err) {
        caught = err as ConflictException;
      }

      expect(caught).toBeInstanceOf(ConflictException);
      const body = caught!.getResponse() as Record<string, unknown>;
      expect(body.unmetPrerequisiteIds).toEqual(['lifetimes-201']);
    });

    it('unlocks once all prerequisites are completed', () => {
      enrollmentService.enroll('user-1', 'intro-rust-101');
      enrollmentService.completeCourse('user-1', 'intro-rust-101');
      enrollmentService.enroll('user-1', 'ownership-101');
      enrollmentService.completeCourse('user-1', 'ownership-101');
      enrollmentService.enroll('user-1', 'lifetimes-201');
      enrollmentService.completeCourse('user-1', 'lifetimes-201');

      const enrollment = enrollmentService.enroll('user-1', 'advanced-async-301');
      expect(enrollment.courseId).toBe('advanced-async-301');
    });
  });

  // ── Course completion ────────────────────────────────────────────────────

  describe('completeCourse', () => {
    it('sets completedAt', () => {
      makeCourse('ownership-101');
      enrollmentService.enroll('user-1', 'ownership-101');
      const completed = enrollmentService.completeCourse('user-1', 'ownership-101');

      expect(completed.completedAt).toBeDefined();
    });

    it('throws 404 when no enrollment exists', () => {
      makeCourse('ownership-101');
      expect(() =>
        enrollmentService.completeCourse('user-1', 'ownership-101'),
      ).toThrow(NotFoundException);
    });

    it('throws 400 when already completed', () => {
      makeCourse('ownership-101');
      enrollmentService.enroll('user-1', 'ownership-101');
      enrollmentService.completeCourse('user-1', 'ownership-101');

      expect(() =>
        enrollmentService.completeCourse('user-1', 'ownership-101'),
      ).toThrow(BadRequestException);
    });
  });

  // ── Lesson-level prerequisite enforcement ────────────────────────────────

  describe('lesson prerequisites', () => {
    beforeEach(() => {
      makeCourse('ownership-101');
      enrollmentService.enroll('user-1', 'ownership-101');

      makeLesson('lesson-1', 'ownership-101', 1);
      makeLesson('lesson-2', 'ownership-101', 2, ['lesson-1']);
      makeLesson('lesson-3', 'ownership-101', 3, ['lesson-1', 'lesson-2']);
    });

    it('allows starting a lesson with no prerequisites', () => {
      const prog = enrollmentService.startLesson('user-1', 'lesson-1');
      expect(prog.lessonId).toBe('lesson-1');
      expect(prog.startedAt).toBeDefined();
    });

    it('blocks with 409 when prerequisite lesson not started', () => {
      let caught: ConflictException | undefined;
      try {
        enrollmentService.startLesson('user-1', 'lesson-2');
      } catch (err) {
        caught = err as ConflictException;
      }

      expect(caught).toBeInstanceOf(ConflictException);
      const body = caught!.getResponse() as Record<string, unknown>;
      expect(body.code).toBe('PREREQUISITES_NOT_MET');
      expect(body.unmetPrerequisiteIds).toEqual(['lesson-1']);
    });

    it('blocks with 409 when prerequisite lesson started but not completed', () => {
      enrollmentService.startLesson('user-1', 'lesson-1');
      // Not completing lesson-1

      let caught: ConflictException | undefined;
      try {
        enrollmentService.startLesson('user-1', 'lesson-2');
      } catch (err) {
        caught = err as ConflictException;
      }

      expect(caught).toBeInstanceOf(ConflictException);
      const body = caught!.getResponse() as Record<string, unknown>;
      expect(body.unmetPrerequisiteIds).toEqual(['lesson-1']);
    });

    it('allows the next lesson after completing the prerequisite', () => {
      enrollmentService.startLesson('user-1', 'lesson-1');
      enrollmentService.completeLesson('user-1', 'lesson-1');

      const prog = enrollmentService.startLesson('user-1', 'lesson-2');
      expect(prog.lessonId).toBe('lesson-2');
    });

    it('lists all unmet lesson prerequisites in the 409 body', () => {
      // lesson-3 requires lesson-1 AND lesson-2
      let caught: ConflictException | undefined;
      try {
        enrollmentService.startLesson('user-1', 'lesson-3');
      } catch (err) {
        caught = err as ConflictException;
      }

      expect(caught).toBeInstanceOf(ConflictException);
      const body = caught!.getResponse() as Record<string, unknown>;
      expect(body.unmetPrerequisiteIds).toEqual(
        expect.arrayContaining(['lesson-1', 'lesson-2']),
      );
    });

    it('blocks with 400 if user is not enrolled in the course', () => {
      expect(() =>
        enrollmentService.startLesson('stranger', 'lesson-1'),
      ).toThrow(BadRequestException);
    });

    it('blocks duplicate start with 400', () => {
      enrollmentService.startLesson('user-1', 'lesson-1');
      expect(() => enrollmentService.startLesson('user-1', 'lesson-1')).toThrow(
        BadRequestException,
      );
    });
  });

  // ── Lesson completion ────────────────────────────────────────────────────

  describe('completeLesson', () => {
    it('sets completedAt', () => {
      makeCourse('ownership-101');
      enrollmentService.enroll('user-1', 'ownership-101');
      makeLesson('lesson-1', 'ownership-101', 1);
      enrollmentService.startLesson('user-1', 'lesson-1');

      const prog = enrollmentService.completeLesson('user-1', 'lesson-1');
      expect(prog.completedAt).toBeDefined();
    });

    it('throws 404 when lesson not started yet', () => {
      makeCourse('ownership-101');
      makeLesson('lesson-1', 'ownership-101', 1);

      expect(() =>
        enrollmentService.completeLesson('user-1', 'lesson-1'),
      ).toThrow(NotFoundException);
    });

    it('throws 400 when lesson already completed', () => {
      makeCourse('ownership-101');
      enrollmentService.enroll('user-1', 'ownership-101');
      makeLesson('lesson-1', 'ownership-101', 1);
      enrollmentService.startLesson('user-1', 'lesson-1');
      enrollmentService.completeLesson('user-1', 'lesson-1');

      expect(() =>
        enrollmentService.completeLesson('user-1', 'lesson-1'),
      ).toThrow(BadRequestException);
    });
  });

  // ── Real-world scenario: Ownership before Lifetimes ──────────────────────

  describe('real-world scenario: Ownership → Lifetimes chain', () => {
    it('mirrors the acceptance-criteria example from BE-041', () => {
      makeCourse('ownership-101');
      makeCourse('lifetimes-201', ['ownership-101']);

      // Step 1: Try to skip straight to Lifetimes → blocked
      expect(() => enrollmentService.enroll('learner', 'lifetimes-201')).toThrow(ConflictException);

      // Step 2: Enrol in Ownership
      enrollmentService.enroll('learner', 'ownership-101');

      // Step 3: Still blocked — enrolled but not completed
      expect(() => enrollmentService.enroll('learner', 'lifetimes-201')).toThrow(ConflictException);

      // Step 4: Complete Ownership
      enrollmentService.completeCourse('learner', 'ownership-101');

      // Step 5: Now Lifetimes unlocks
      const enrollment = enrollmentService.enroll('learner', 'lifetimes-201');
      expect(enrollment.courseId).toBe('lifetimes-201');
    });
  });
});
