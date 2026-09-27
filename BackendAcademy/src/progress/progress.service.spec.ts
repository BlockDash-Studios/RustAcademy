import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DomainEventBus } from '../gamification/domain-event-bus';
import { XpService } from '../gamification/xp.service';
import { ProgressService } from './progress.service';

/**
 * Unit tests for BE-038 — Progress tracking.
 *
 * Acceptance criteria: "Completing all lessons+tasks marks course complete and
 * triggers certificate eligibility."
 */
describe('ProgressService (BE-038)', () => {
  let eventBus: DomainEventBus;
  let xpService: XpService;
  let progress: ProgressService;

  const manifest = { courseId: 'ownership-101', lessonIds: ['l1', 'l2'], taskIds: ['t1'] };

  beforeEach(() => {
    eventBus = new DomainEventBus();
    xpService = new XpService(eventBus);
    xpService.onModuleInit();
    progress = new ProgressService(eventBus, xpService);
    progress.registerCourse(manifest);
  });

  afterEach(() => {
    xpService.onModuleDestroy();
  });

  it('reports lesson and task completion percentages as work is finished', () => {
    progress.completeLesson('alice', 'ownership-101', 'l1');

    const half = progress.getCourseProgress('alice', 'ownership-101');
    expect(half.lessonsCompleted).toBe(1);
    expect(half.lessonsTotal).toBe(2);
    expect(half.lessonCompletionPercent).toBe(50);
    expect(half.tasksCompleted).toBe(0);
    expect(half.taskCompletionPercent).toBe(0);
    expect(half.completed).toBe(false);
    expect(half.certificateEligible).toBe(false);
  });

  it('completes the course and triggers certificate eligibility only when lessons and tasks are all done', () => {
    progress.completeTask('alice', 'ownership-101', 't1');
    const tasksOnly = progress.getCourseProgress('alice', 'ownership-101');
    expect(tasksOnly.xpEarned).toBe(10); // task.passed
    expect(tasksOnly.completed).toBe(false);
    expect(tasksOnly.certificateEligible).toBe(false);

    progress.completeLesson('alice', 'ownership-101', 'l1');
    expect(progress.getCourseProgress('alice', 'ownership-101').completed).toBe(false);

    const done = progress.completeLesson('alice', 'ownership-101', 'l2');
    expect(done.completed).toBe(true);
    expect(done.completedAt).toBeDefined();
    expect(done.lessonCompletionPercent).toBe(100);
    expect(done.taskCompletionPercent).toBe(100);
    expect(done.certificateEligible).toBe(true);
    expect(done.certificate).toMatchObject({
      userId: 'alice',
      courseId: 'ownership-101',
      status: 'eligible',
    });
    expect(done.xpEarned).toBe(110); // 10 task.passed + 100 course.completed
  });

  it('issues the certificate and the completion XP bonus exactly once', () => {
    progress.completeLesson('alice', 'ownership-101', 'l1');
    progress.completeLesson('alice', 'ownership-101', 'l2');
    const first = progress.completeTask('alice', 'ownership-101', 't1');

    const replay = progress.getCourseProgress('alice', 'ownership-101');
    expect(replay.certificate?.certificateId).toBe(first.certificate?.certificateId);
    expect(progress.listCertificates('alice')).toHaveLength(1);
    expect(xpService.getBalance('alice')).toBe(110);
  });

  it('aggregates progress, XP and certificates across courses for the dashboard', () => {
    progress.registerCourse({ courseId: 'lifetimes-201', lessonIds: ['a'], taskIds: ['b'] });

    progress.completeLesson('alice', 'ownership-101', 'l1');
    progress.completeLesson('alice', 'ownership-101', 'l2');
    progress.completeTask('alice', 'ownership-101', 't1');
    progress.completeTask('alice', 'lifetimes-201', 'b');

    const dashboard = progress.getDashboard('alice');
    expect(dashboard.totalXp).toBe(120); // 110 completed course + 10 in-progress task
    expect(dashboard.coursesCompleted).toBe(1);
    expect(dashboard.coursesInProgress).toBe(1);
    expect(dashboard.certificates).toHaveLength(1);
    expect(dashboard.courses.map((course) => course.courseId).sort()).toEqual([
      'lifetimes-201',
      'ownership-101',
    ]);

    expect(progress.getDashboard('bob')).toMatchObject({
      totalXp: 0,
      coursesCompleted: 0,
      coursesInProgress: 0,
      courses: [],
    });
  });

  it('rejects unknown content, duplicate completions, duplicate manifests and thin manifests', () => {
    expect(() => progress.completeLesson('alice', 'ghost', 'l1')).toThrow(NotFoundException);
    expect(() => progress.completeLesson('alice', 'ownership-101', 'ghost')).toThrow(NotFoundException);
    expect(() => progress.completeTask('alice', 'ownership-101', 'ghost')).toThrow(NotFoundException);

    progress.completeLesson('alice', 'ownership-101', 'l1');
    expect(() => progress.completeLesson('alice', 'ownership-101', 'l1')).toThrow(BadRequestException);

    expect(() => progress.registerCourse(manifest)).toThrow(ConflictException);
    expect(() =>
      progress.registerCourse({ courseId: 'empty', lessonIds: [], taskIds: [] }),
    ).toThrow(BadRequestException);
  });
});
