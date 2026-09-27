import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CertificatesService } from './certificates.service';

/**
 * Unit tests for BE-042 — Certification eligibility checks.
 *
 * Acceptance criteria: "Eligibility endpoint used by the certificate minting
 * job" — a learner qualifies only when every required task is passed at the
 * course's minimum score.
 */
describe('CertificatesService (BE-042)', () => {
  let certificates: CertificatesService;

  const criteria = { courseId: 'ownership-101', taskIds: ['t1', 't2'], minScore: 70 };

  beforeEach(() => {
    certificates = new CertificatesService();
    certificates.registerCourse(criteria);
  });

  describe('course criteria', () => {
    it('returns a copy so callers cannot mutate stored criteria', () => {
      const stored = certificates.registerCourse({ courseId: 'lifetimes-201', taskIds: ['a'] });

      stored.taskIds.push('injected');
      expect(certificates.getCourse('lifetimes-201').taskIds).toEqual(['a']);
    });

    it('defaults the minimum score to the grading pass threshold', () => {
      certificates.registerCourse({ courseId: 'lifetimes-201', taskIds: ['a'] });
      expect(certificates.getCourse('lifetimes-201').minScore).toBe(60);
    });

    it('rejects duplicate criteria, empty task lists and out-of-range minimums', () => {
      expect(() =>
        certificates.registerCourse({ courseId: 'ownership-101', taskIds: ['t9'] }),
      ).toThrow(ConflictException);
      expect(() =>
        certificates.registerCourse({ courseId: 'empty', taskIds: [] }),
      ).toThrow(BadRequestException);
      expect(() =>
        certificates.registerCourse({ courseId: 'bad-min', taskIds: ['a'], minScore: 101 }),
      ).toThrow(BadRequestException);
      expect(() => certificates.getCourse('ghost')).toThrow(NotFoundException);
    });
  });

  describe('recording task results', () => {
    it('rejects results for unknown courses, unrequired tasks and bad scores', () => {
      expect(() =>
        certificates.recordTaskResult({ userId: 'alice', courseId: 'ghost', taskId: 't1', score: 80 }),
      ).toThrow(NotFoundException);
      expect(() =>
        certificates.recordTaskResult({
          userId: 'alice',
          courseId: 'ownership-101',
          taskId: 't9',
          score: 80,
        }),
      ).toThrow(NotFoundException);
      expect(() =>
        certificates.recordTaskResult({
          userId: 'alice',
          courseId: 'ownership-101',
          taskId: 't1',
          score: 120,
        }),
      ).toThrow(BadRequestException);
    });

    it('keeps only the best score for a task so a retake cannot lower the certificate', () => {
      certificates.recordTaskResult({ userId: 'alice', courseId: 'ownership-101', taskId: 't1', score: 85 });
      const retake = certificates.recordTaskResult({
        userId: 'alice',
        courseId: 'ownership-101',
        taskId: 't1',
        score: 65,
      });

      expect(retake.score).toBe(85);
      expect(retake.passed).toBe(true);
      expect(certificates.getTaskResults('alice', 'ownership-101')).toHaveLength(1);
    });
  });

  describe('eligibility', () => {
    it('is ineligible with no results at all', () => {
      const check = certificates.checkEligibility('alice', 'ownership-101');

      expect(check.eligible).toBe(false);
      expect(check.status).toBe('ineligible');
      expect(check.tasksPassed).toBe(0);
      expect(check.tasksRequired).toBe(2);
      expect(check.finalScore).toBeNull();
      expect(check.reasons.join(' ')).toMatch(/No graded result/);
    });

    it('is ineligible when a task is missing a result', () => {
      certificates.recordTaskResult({ userId: 'alice', courseId: 'ownership-101', taskId: 't1', score: 90 });

      const check = certificates.checkEligibility('alice', 'ownership-101');

      expect(check.eligible).toBe(false);
      expect(check.tasksPassed).toBe(1);
      expect(check.reasons.join(' ')).toMatch(/t2/);
    });

    it('is ineligible when a task scores below the minimum', () => {
      certificates.recordTaskResult({ userId: 'alice', courseId: 'ownership-101', taskId: 't1', score: 90 });
      certificates.recordTaskResult({ userId: 'alice', courseId: 'ownership-101', taskId: 't2', score: 69 });

      const check = certificates.checkEligibility('alice', 'ownership-101');

      expect(check.eligible).toBe(false);
      expect(check.tasksPassed).toBe(1);
      expect(check.reasons.join(' ')).toMatch(/below the minimum of 70/);
    });

    it('is eligible with a final score once every task meets the minimum', () => {
      certificates.recordTaskResult({ userId: 'alice', courseId: 'ownership-101', taskId: 't1', score: 80 });
      certificates.recordTaskResult({ userId: 'alice', courseId: 'ownership-101', taskId: 't2', score: 90 });

      const check = certificates.checkEligibility('alice', 'ownership-101');

      expect(check).toMatchObject({
        userId: 'alice',
        courseId: 'ownership-101',
        eligible: true,
        status: 'eligible',
        minScore: 70,
        tasksRequired: 2,
        tasksPassed: 2,
        averageScore: 85,
        finalScore: 85,
        reasons: [],
      });
      expect(check.tasks).toHaveLength(2);
    });
  });

  describe('minting-job batch view', () => {
    it('lists only learners whose every task passes', () => {
      certificates.recordTaskResult({ userId: 'alice', courseId: 'ownership-101', taskId: 't1', score: 80 });
      certificates.recordTaskResult({ userId: 'alice', courseId: 'ownership-101', taskId: 't2', score: 80 });
      certificates.recordTaskResult({ userId: 'bob', courseId: 'ownership-101', taskId: 't1', score: 80 });
      certificates.recordTaskResult({ userId: 'carol', courseId: 'ownership-101', taskId: 't1', score: 40 });
      certificates.recordTaskResult({ userId: 'carol', courseId: 'ownership-101', taskId: 't2', score: 40 });

      const eligible = certificates.listEligibleLearners('ownership-101');

      expect(eligible.map((check) => check.userId)).toEqual(['alice']);
    });
  });
});
