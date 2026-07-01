import { NotFoundException } from '@nestjs/common';
import { CourseService } from '../course.service';
import { CourseLevel } from '../interfaces/course-level.enum';
import { RegisterCourseProgressDto } from './dto/register-course-progress.dto';
import {
  RecordLessonCompletionDto,
  RecordTaskCompletionDto,
} from './dto/record-completion.dto';
import {
  CourseProgressStatus,
} from './interfaces/progress-snapshot.interface';
import { ProgressService } from './progress.service';

/**
 * Build a fresh CourseService and seed two known courses so tests can
 * snapshot progress against stable ids. Course ids come from
 * courseService.create() because CreateCourseDto doesn't accept an id.
 */
async function buildServices() {
  const courseService = new CourseService();
  const service = new ProgressService(courseService);
  const x = await courseService.create({
    title: 'Rust Basics',
    description: 'A starter course',
    level: CourseLevel.BEGINNER,
    order: 1,
    learningPathId: 'path-rust-basics',
    duration: 60,
    xpReward: 200,
  });
  const y = await courseService.create({
    title: 'Rust Web3',
    description: 'Web3 specialization',
    level: CourseLevel.WEB3,
    order: 2,
    learningPathId: 'path-rust-web3',
    duration: 90,
    xpReward: 400,
  });
  return { service, courseService, courseX: x.id, courseY: y.id };
}

const USER_A = '00000000-0000-4000-8000-0000000000aa';
const USER_B = '00000000-0000-4000-8000-0000000000bb';

describe('ProgressService', () => {
  let service: ProgressService;
  let courseService: CourseService;
  let courseX: string;
  let courseY: string;

  beforeEach(async () => {
    ({ service, courseService, courseX, courseY } = await buildServices());
  });

  it('returns an empty snapshot for an unknown learner', async () => {
    const snapshot = await service.getSnapshot(USER_A);

    expect(snapshot.userId).toBe(USER_A);
    expect(snapshot.courses).toEqual([]);
    expect(snapshot.overall).toEqual({
      totalXp: 0,
      coursesCompleted: 0,
      coursesInProgress: 0,
      lessonsCompleted: 0,
      tasksCompleted: 0,
      lastActiveAt: null,
    });
    expect(snapshot.generatedAt).toBeInstanceOf(Date);
  });

  it('registerCourse() throws NotFoundException when the course does not exist', async () => {
    const dto: RegisterCourseProgressDto = {
      courseId: 'not-a-real-course',
      totalLessons: 5,
    };

    await expect(service.registerCourse(USER_A, dto)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('registerCourse() stores totals and seeds a placeholder progress row', async () => {
    const record = await service.registerCourse(USER_A, {
      courseId: courseX,
      totalLessons: 4,
      totalTasks: 2,
    });

    expect(record.courseId).toBe(courseX);
    expect(record.totalLessons).toBe(4);
    expect(record.totalTasks).toBe(2);
    expect(record.completedLessonIds.size).toBe(0);
    expect(record.completedAt).toBeNull();
  });

  it('registerCourse() preserves completions on re-registration; explicit values overwrite', async () => {
    await service.registerCourse(USER_A, { courseId: courseX, totalLessons: 4 });
    await service.recordLessonCompletion(USER_A, courseX, {
      lessonId: 'lesson-1',
      xpEarned: 20,
    });

    // An explicit totalTasks=3 on a second call fills the previously-empty
    // tasks total; an explicit totalLessons=0 is a *valid* value meaning
    // "no lessons required" and overwrites the prior 4. The critical
    // guarantee is that prior completions survive the re-register.
    const updated = await service.registerCourse(USER_A, {
      courseId: courseX,
      totalLessons: 0,
      totalTasks: 3,
    });

    expect(updated.totalLessons).toBe(0);
    expect(updated.totalTasks).toBe(3);
    expect(updated.completedLessonIds.has('lesson-1')).toBe(true);
  });

  it('omitting a total on re-register keeps the previously registered value', async () => {
    await service.registerCourse(USER_A, {
      courseId: courseX,
      totalLessons: 4,
      totalTasks: 2,
    });

    // Total tasks is omitted -> prior value (2) is kept. Total lessons is
    // undefined -> prior value (4) is kept.
    const updated = await service.registerCourse(USER_A, {
      courseId: courseX,
    });

    expect(updated.totalLessons).toBe(4);
    expect(updated.totalTasks).toBe(2);
  });

  it('recordLessonCompletion() is idempotent for repeated lesson ids', async () => {
    await service.registerCourse(USER_A, { courseId: courseX, totalLessons: 3 });
    const dto: RecordLessonCompletionDto = { lessonId: 'lesson-1', xpEarned: 50 };

    await service.recordLessonCompletion(USER_A, courseX, dto);
    const second = await service.recordLessonCompletion(USER_A, courseX, dto);

    expect(second.completedLessonIds.size).toBe(1);
    expect(second.xpEarned).toBe(50);
  });

  it('recordTaskCompletion() accumulates XP per distinct task id', async () => {
    await service.registerCourse(USER_A, {
      courseId: courseX,
      totalLessons: 2,
      totalTasks: 3,
    });

    await service.recordTaskCompletion(USER_A, courseX, {
      taskId: 'task-1',
      xpEarned: 10,
    });
    await service.recordTaskCompletion(USER_A, courseX, {
      taskId: 'task-2',
      xpEarned: 15,
    });
    await service.recordTaskCompletion(USER_A, courseX, {
      taskId: 'task-1',
      xpEarned: 10,
    });

    const snapshot = await service.getCourseSnapshot(USER_A, courseX);
    expect(snapshot?.xpEarned).toBe(25);
    expect(snapshot?.tasksCompleted).toBe(2);
  });

  it('auto-registers a course when completion is recorded before registerCourse', async () => {
    const record = await service.recordLessonCompletion(USER_A, courseX, {
      lessonId: 'lesson-1',
      xpEarned: 5,
    });

    expect(record.courseId).toBe(courseX);
    expect(record.totalLessons).toBe(0);
    expect(record.completedLessonIds.has('lesson-1')).toBe(true);
  });

  it('throws when recording completion for an unknown course', async () => {
    await expect(
      service.recordLessonCompletion(USER_A, 'bogus-course-id', {
        lessonId: 'l1',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('marks a course as COMPLETED only when lesson and task targets are both met', async () => {
    await service.registerCourse(USER_A, {
      courseId: courseX,
      totalLessons: 2,
      totalTasks: 1,
    });

    await service.recordLessonCompletion(USER_A, courseX, {
      lessonId: 'l1',
      xpEarned: 0,
    });
    await service.recordLessonCompletion(USER_A, courseX, {
      lessonId: 'l2',
      xpEarned: 0,
    });
    let snapshot = await service.getCourseSnapshot(USER_A, courseX);
    expect(snapshot?.status).toBe(CourseProgressStatus.IN_PROGRESS);

    await service.recordTaskCompletion(USER_A, courseX, {
      taskId: 't1',
      xpEarned: 0,
    });
    snapshot = await service.getCourseSnapshot(USER_A, courseX);
    expect(snapshot?.status).toBe(CourseProgressStatus.COMPLETED);
    expect(snapshot?.completedAt).toBeInstanceOf(Date);
  });

  it('returns IN_PROGRESS for a partially completed course', async () => {
    await service.registerCourse(USER_A, { courseId: courseX, totalLessons: 5 });
    await service.recordLessonCompletion(USER_A, courseX, {
      lessonId: 'l1',
      xpEarned: 10,
    });

    const snapshot = await service.getCourseSnapshot(USER_A, courseX);
    expect(snapshot?.status).toBe(CourseProgressStatus.IN_PROGRESS);
    // (1/5) * 0.7 weighted + 0 tasks = 0.14 / 0.7 = 0.2 -> 20%
    expect(snapshot?.completionPercent).toBe(20);
  });

  it('stays NOT_STARTED when no lessons/tasks have been recorded', async () => {
    await service.registerCourse(USER_A, {
      courseId: courseX,
      totalLessons: 5,
      totalTasks: 3,
    });

    const snapshot = await service.getCourseSnapshot(USER_A, courseX);
    expect(snapshot?.status).toBe(CourseProgressStatus.NOT_STARTED);
  });

  it('emits a 0% completion when no totals are registered', async () => {
    await service.recordLessonCompletion(USER_A, courseX, { lessonId: 'l1' });

    const snapshot = await service.getCourseSnapshot(USER_A, courseX);
    expect(snapshot?.completionPercent).toBe(0);
  });

  it('aggregates overall stats across multiple courses', async () => {
    // Course X: complete everything
    await service.registerCourse(USER_A, {
      courseId: courseX,
      totalLessons: 1,
      totalTasks: 1,
    });
    await service.recordLessonCompletion(USER_A, courseX, {
      lessonId: 'l1',
      xpEarned: 25,
    });
    await service.recordTaskCompletion(USER_A, courseX, {
      taskId: 't1',
      xpEarned: 25,
    });

    // Course Y: partial
    await service.registerCourse(USER_A, { courseId: courseY, totalLessons: 4 });
    await service.recordLessonCompletion(USER_A, courseY, {
      lessonId: 'l1',
      xpEarned: 10,
    });

    const snapshot = await service.getSnapshot(USER_A);

    expect(snapshot.overall.totalXp).toBe(60);
    expect(snapshot.overall.coursesCompleted).toBe(1);
    expect(snapshot.overall.coursesInProgress).toBe(1);
    expect(snapshot.overall.lessonsCompleted).toBe(2);
    expect(snapshot.overall.tasksCompleted).toBe(1);
    expect(snapshot.overall.lastActiveAt).toBeInstanceOf(Date);

    expect(snapshot.courses).toHaveLength(2);
  });

  it('skips courses whose underlying course record was deleted', async () => {
    await service.registerCourse(USER_A, { courseId: courseX, totalLessons: 1 });
    await courseService.remove(courseX);

    const snapshot = await service.getSnapshot(USER_A);
    expect(snapshot.courses).toEqual([]);
    expect(snapshot.overall.coursesInProgress).toBe(0);
  });

  it('getCourseSnapshot() returns null for a course the learner never touched', async () => {
    expect(await service.getCourseSnapshot(USER_A, courseX)).toBeNull();
  });

  it('isolates progress between learners', async () => {
    await service.registerCourse(USER_A, { courseId: courseX, totalLessons: 1 });
    await service.recordLessonCompletion(USER_A, courseX, {
      lessonId: 'l1',
      xpEarned: 5,
    });

    const a = await service.getSnapshot(USER_A);
    const b = await service.getSnapshot(USER_B);

    expect(a.overall.totalXp).toBe(5);
    expect(a.courses).toHaveLength(1);
    expect(b.courses).toHaveLength(0);
    expect(b.overall.totalXp).toBe(0);
  });

  it('resetLearner() clears the learner state', async () => {
    await service.registerCourse(USER_A, { courseId: courseX });
    await service.recordLessonCompletion(USER_A, courseX, { lessonId: 'l1' });

    expect(await service.resetLearner(USER_A)).toBe(true);
    const snapshot = await service.getSnapshot(USER_A);
    expect(snapshot.courses).toEqual([]);
  });

  it('exposes the expected xpAvailable from course.xpReward', async () => {
    await service.registerCourse(USER_A, { courseId: courseX });
    const snap = await service.getCourseSnapshot(USER_A, courseX);
    expect(snap?.xpAvailable).toBe(200);
  });

  it('pushes untouched courses to the end of the snapshot', async () => {
    // Register an untouched course first.
    await service.registerCourse(USER_A, { courseId: courseY, totalLessons: 5 });

    await new Promise((resolve) => setTimeout(resolve, 5));
    // Then register and touch a second course.
    await service.registerCourse(USER_A, { courseId: courseX, totalLessons: 5 });
    await service.recordLessonCompletion(USER_A, courseX, { lessonId: 'l-x' });

    const snapshot = await service.getSnapshot(USER_A);
    const orderedIds = snapshot.courses.map((c) => c.courseId);

    // courseX was touched (first), courseY was not touched (last).
    expect(orderedIds[0]).toBe(courseX);
    expect(orderedIds[orderedIds.length - 1]).toBe(courseY);
  });

  it('exposes firstCompletedLessonId hint from prior lesson completions', async () => {
    await service.registerCourse(USER_A, { courseId: courseX });
    await service.recordLessonCompletion(USER_A, courseX, {
      lessonId: 'l-first',
    });

    const snap = await service.getCourseSnapshot(USER_A, courseX);
    expect(snap?.firstCompletedLessonId).toBe('l-first');

    // When no lessons are completed the hint is null.
    await service.resetLearner(USER_A);
    await service.registerCourse(USER_A, { courseId: courseX });
    const fresh = await service.getCourseSnapshot(USER_A, courseX);
    expect(fresh?.firstCompletedLessonId).toBeNull();
  });
});
