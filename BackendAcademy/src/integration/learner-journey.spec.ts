/**
 * Integration tests — end-to-end learner journeys (#452, #643 / BA-075)
 *
 * Covers the critical path from enrollment through submission, review,
 * progress, reward, and certificate without mocking every layer. Uses real
 * NestJS DI with the full service graph; only external infrastructure
 * (TypeORM repositories, telemetry, certificate issuance) is replaced with
 * in-memory fixtures so the suite runs in CI with isolated state.
 *
 * Regression paths required by BA-075:
 *   - Happy path        — Journeys 1–5 and 7 (auth, onboarding, enrollment,
 *                         submission, review, rewards, certificate).
 *   - Retry path        — rejected submissions can be resubmitted; challenge
 *                         attempt limits are enforced (Journey 6).
 *   - Unauthorized path — JWT role guards reject missing/invalid/learner
 *                         tokens on tutor-only endpoints (Journey 6).
 *   - Partial-failure   — mixed review outcomes keep queue/stats consistent
 *                         (Journey 6).
 *
 * Run:  npx jest --config jest.config.ts --testPathPattern='integration/learner-journey'
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  ExecutionContext,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

// ── Auth ──
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '../auth/enums/user-role.enum';
import { JwtTutorGuard } from '../auth/guards/jwt-tutor.guard';

// ── Onboarding ──
import { OnboardingService } from '../onboarding/onboarding.service';

// ── Courses & Lessons ──
import { CourseService } from '../courses/course.service';
import { CourseEntity } from '../courses/course.entity';
import { CourseRevisionEntity } from '../courses/course-revision.entity';
import { CertificateService } from '../courses/certificate.service';
import { CourseLevel } from '../courses/interfaces/course-level.enum';
import { LessonService } from '../lessons/lesson.service';

// ── Tasks & Submissions ──
import { TaskService } from '../tasks/task.service';
import { TaskDifficulty } from '../tasks/interfaces/task-difficulty.enum';
import { SubmissionService } from '../submissions/submission.service';
import { TutorReviewService } from '../submissions/tutor-review.service';
import { SubmissionStatus } from '../submissions/interfaces/submission-status.enum';

// ── Rewards & Streaks ──
import { RewardsService } from '../rewards/rewards.service';
import { StreakService } from '../rewards/streak.service';
import { DatabaseService } from '../database/database.service';

// ── Badges ──
import { BadgesService } from '../badges/badges.service';

// ── Social ──
import { SocialService } from '../social/social.service';

// ── Challenges ──
import { ChallengesService } from '../challenges/challenges.service';

// ── Monitoring ──
import { MonitoringService } from '../monitoring/monitoring.service';
import { TransactionManagerService } from '../common/transaction-manager.service';

/**
 * Minimal in-memory TypeORM-like repository used to isolate persistence
 * per suite. `create` instantiates the real entity class so default values
 * (e.g. `isActive`, `version`) behave like production.
 */
function createInMemoryRepo<T extends { id: string }>(
  Entity?: new (partial: Partial<T>) => T,
) {
  const store = new Map<string, T>();

  function matches(row: T, where?: Record<string, unknown>): boolean {
    if (!where) return true;
    return Object.entries(where).every(
      ([key, value]) => (row as Record<string, unknown>)[key] === value,
    );
  }

  function query(opts?: {
    where?: Record<string, unknown>;
    order?: Record<string, 'ASC' | 'DESC'>;
  }): T[] {
    let rows = Array.from(store.values()).filter((r) => matches(r, opts?.where));
    if (opts?.order) {
      const [key, direction] = Object.entries(opts.order)[0];
      rows = [...rows].sort((a, b) => {
        const av = (a as Record<string, unknown>)[key] as number;
        const bv = (b as Record<string, unknown>)[key] as number;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return direction === 'DESC' ? -cmp : cmp;
      });
    }
    return rows;
  }

  return {
    store,
    create: (partial: Partial<T>): T =>
      Entity ? new Entity(partial) : ({ ...partial } as T),
    save: async (entity: T): Promise<T> => {
      store.set(entity.id, entity);
      return entity;
    },
    find: async (opts?: {
      where?: Record<string, unknown>;
      order?: Record<string, 'ASC' | 'DESC'>;
    }): Promise<T[]> => query(opts),
    findOne: async (opts?: {
      where?: Record<string, unknown>;
      order?: Record<string, 'ASC' | 'DESC'>;
    }): Promise<T | null> => query(opts)[0] ?? null,
    remove: async (entity: T): Promise<T> => {
      store.delete(entity.id);
      return entity;
    },
    count: async (opts?: { where?: Record<string, unknown> }): Promise<number> =>
      query(opts).length,
  };
}

/** Build a fake HTTP context for guard tests. */
function mockHttpContext(headers: Record<string, string> = {}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('End-to-End Learner Journey', () => {
  let onboarding: OnboardingService;
  let courses: CourseService;
  let lessons: LessonService;
  let tasks: TaskService;
  let submissions: SubmissionService;
  let tutorReview: TutorReviewService;
  let rewards: RewardsService;
  let streaks: StreakService;
  let badges: BadgesService;
  let social: SocialService;
  let challenges: ChallengesService;
  let jwt: JwtService;

  // ─────────────────────────────────────────────────────────────────
  // Test fixtures
  // ─────────────────────────────────────────────────────────────────
  const LEARNER_ID = 'learner-alice-42';
  const TUTOR_ID = 'tutor-bob-99';

  const courseRepo = createInMemoryRepo<CourseEntity>(CourseEntity);
  const revisionRepo = createInMemoryRepo<CourseRevisionEntity>(
    CourseRevisionEntity,
  );

  // Plain functions (not jest.fn) so `resetMocks` in the jest config does
  // not wipe their implementations between tests.
  const certificateStub = {
    generateCertificate: async (params: {
      userId: string;
      courseId: string;
      courseTitle: string;
      xpAwarded: number;
    }) => ({
      id: `cert-${params.courseId}`,
      userId: params.userId,
      courseId: params.courseId,
      courseTitle: params.courseTitle,
      issuedAt: new Date(),
      verificationCode: `vc-${params.courseId}`,
      shareableUrl: `https://rustacademy.xyz/certificates/verify/vc-${params.courseId}`,
      xpAwarded: params.xpAwarded,
      completionDate: new Date().toISOString(),
      status: 'active',
    }),
    revokeCertificate: () => null,
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        CourseService,
        LessonService,
        TaskService,
        SubmissionService,
        RewardsService,
        StreakService,
        BadgesService,
        SocialService,
        ChallengesService,
        TutorReviewService,
        TransactionManagerService,
        {
          provide: getRepositoryToken(CourseEntity),
          useValue: courseRepo,
        },
        {
          provide: getRepositoryToken(CourseRevisionEntity),
          useValue: revisionRepo,
        },
        {
          provide: CertificateService,
          useValue: certificateStub,
        },
        {
          // Telemetry is out of scope for these journeys.
          provide: MonitoringService,
          useValue: {
            recordDomainEvent: jest.fn(),
            recordError: jest.fn(),
            recordHttpRequest: jest.fn(),
          },
        },
        {
          // No persistence-backed coupon flows in these journeys.
          provide: DatabaseService,
          useValue: {},
        },
        {
          provide: JwtService,
          useValue: {
            sign: (payload: Record<string, unknown>) =>
              `mock-jwt-${JSON.stringify(payload)}`,
            verify: () => true,
            // Plain async function: `resetMocks` would strip a jest.fn
            // implementation between tests.
            verifyAsync: async (token: string) => {
              if (token.startsWith('mock-jwt-')) {
                return JSON.parse(token.slice('mock-jwt-'.length));
              }
              throw new Error('invalid token');
            },
          },
        },
      ],
    }).compile();

    onboarding = module.get(OnboardingService);
    courses = module.get(CourseService);
    lessons = module.get(LessonService);
    tasks = module.get(TaskService);
    submissions = module.get(SubmissionService);
    tutorReview = module.get(TutorReviewService);
    rewards = module.get(RewardsService);
    streaks = module.get(StreakService);
    badges = module.get(BadgesService);
    social = module.get(SocialService);
    challenges = module.get(ChallengesService);
    jwt = module.get(JwtService);
  });

  beforeEach(() => {
    // Isolate shared in-memory state across journeys (#451). Course state is
    // intentionally NOT cleared here: Journey 2 builds a course catalog across
    // sequential tests, and Journey 7 provisions its own fixtures.
    rewards.clearAll();
    streaks.clearAll();
    badges.clearAll();
    challenges.resetVotes();
    challenges.resetAttempts();
  });

  // ═════════════════════════════════════════════════════════════════
  // Journey 1 — Authentication & Onboarding
  // ═════════════════════════════════════════════════════════════════

  describe('Journey 1: Authentication & Onboarding', () => {
    it('can issue JWTs for different user roles', () => {
      const learnerToken = jwt.sign({ sub: LEARNER_ID, role: UserRole.LEARNER });
      const tutorToken = jwt.sign({ sub: TUTOR_ID, role: UserRole.TUTOR });
      const adminToken = jwt.sign({ sub: 'admin-1', role: UserRole.ADMIN });

      expect(learnerToken).toContain('mock-jwt-');
      expect(tutorToken).not.toBe(learnerToken);
      expect(adminToken).not.toBe(learnerToken);
    });

    it('completes the full onboarding flow', async () => {
      // 1. Create onboarding progress
      const progress = await onboarding.create({
        userId: LEARNER_ID,
        currentStep: 'welcome',
        totalSteps: 4,
      });

      expect(progress.userId).toBe(LEARNER_ID);
      expect(progress.isComplete).toBe(false);
      expect(progress.completedSteps).toEqual([]);

      // 2. Complete steps sequentially
      const steps = ['welcome', 'profile-setup', 'wallet-connect', 'first-task'];
      for (const step of steps) {
        const updated = await onboarding.completeStep(progress.id, step);
        expect(updated.completedSteps).toContain(step);
        expect(updated.currentStep).toBe(step);
      }

      // 3. Verify onboarding is marked complete
      const final = await onboarding.findByUserId(LEARNER_ID);
      expect(final).not.toBeNull();
      expect(final!.isComplete).toBe(true);
      expect(final!.completedAt).toBeInstanceOf(Date);
      expect(final!.completedSteps).toHaveLength(4);
    });
  });

  // ═════════════════════════════════════════════════════════════════
  // Journey 2 — Course Enrollment & Lesson Access
  // ═════════════════════════════════════════════════════════════════

  describe('Journey 2: Course Enrollment & Lessons', () => {
    let courseId: string;

    it('creates a course and returns it in the catalog', async () => {
      const course = await courses.create({
        title: 'Rust Fundamentals',
        description: 'Learn the basics of Rust — ownership, borrowing, and lifetimes.',
        level: CourseLevel.BEGINNER,
        order: 1,
        learningPathId: 'rust-path-1',
        duration: 40,
        prerequisites: [],
        skills: ['rust', 'memory-management'],
        xpReward: 500,
      });

      expect(course.id).toBeDefined();
      expect(course.title).toBe('Rust Fundamentals');
      expect(course.level).toBe(CourseLevel.BEGINNER);
      expect(course.isActive).toBe(true);
      courseId = course.id;
    });

    it('lists all active courses', async () => {
      const all = await courses.findAll();
      expect(all.length).toBeGreaterThanOrEqual(1);
      expect(all.find((c) => c.id === courseId)).toBeDefined();
    });

    it('creates lessons for the course in order', async () => {
      const lesson1 = await lessons.create({
        courseId,
        title: 'Introduction to Ownership',
        content: '## Ownership in Rust\n\nOwnership is Rust\'s most unique feature...',
        order: 1,
        duration: 15,
        xpReward: 50,
        prerequisites: [],
      });

      const lesson2 = await lessons.create({
        courseId,
        title: 'References and Borrowing',
        content: '## Borrowing rules...',
        order: 2,
        duration: 20,
        xpReward: 60,
        prerequisites: ['Introduction to Ownership'],
      });

      expect(lesson1.id).toBeDefined();
      expect(lesson2.order).toBe(2);

      // Lessons should be retrievable by course
      const courseLessons = await lessons.findByCourseId(courseId);
      expect(courseLessons).toHaveLength(2);
      expect(courseLessons[0].order).toBe(1);
      expect(courseLessons[1].order).toBe(2);
    });
  });

  // ═════════════════════════════════════════════════════════════════
  // Journey 3 — Task Submission & Grading
  // ═════════════════════════════════════════════════════════════════

  describe('Journey 3: Task Submission & Grading', () => {
    let taskId: string;

    it('creates a coding task for a lesson', async () => {
      const task = await tasks.create({
        lessonId: 'lesson-ownership-1',
        title: 'Implement a Safe Transfer',
        description: 'Write a function that safely transfers ownership of a value.',
        difficulty: TaskDifficulty.MEDIUM,
        testCases: ['test_transfer()', 'test_drop()'],
        expectedOutput: 'All tests passed',
        xpReward: 100,
        passingScore: 70,
        templateCode: 'fn transfer<T>(value: T) -> T { /* your code */ }',
      });

      expect(task.id).toBeDefined();
      expect(task.difficulty).toBe(TaskDifficulty.MEDIUM);
      expect(task.xpReward).toBe(100);
      taskId = task.id;
    });

    it('learner submits a solution', async () => {
      const submission = await submissions.create({
        taskId,
        userId: LEARNER_ID,
        content: 'fn transfer<T>(value: T) -> T { value }',
      });

      expect(submission.id).toBeDefined();
      expect(submission.status).toBe(SubmissionStatus.PENDING);
      expect(submission.userId).toBe(LEARNER_ID);
      expect(submission.taskId).toBe(taskId);
      expect(submission.submittedAt).toBeInstanceOf(Date);
    });

    it('all submissions start in PENDING status', async () => {
      const pending = await submissions.findByStatus(SubmissionStatus.PENDING);
      expect(pending.length).toBeGreaterThanOrEqual(1);
    });

    it('tutor reviews and approves the submission', async () => {
      const pending = await submissions.findByStatus(SubmissionStatus.PENDING);
      expect(pending.length).toBeGreaterThan(0);

      const submissionId = pending[0].id;
      const reviewed = await submissions.review(
        submissionId,
        TUTOR_ID,
        SubmissionStatus.APPROVED,
        'Great work! Ownership transfer is implemented correctly.',
        95,
      );

      expect(reviewed.status).toBe(SubmissionStatus.APPROVED);
      expect(reviewed.reviewedBy).toBe(TUTOR_ID);
      expect(reviewed.feedback).toBe('Great work! Ownership transfer is implemented correctly.');
      expect(reviewed.score).toBe(95);
      expect(reviewed.reviewedAt).toBeInstanceOf(Date);
    });

    it('learner can find their submissions', async () => {
      const learnerSubs = await submissions.findByUserId(LEARNER_ID);
      expect(learnerSubs.length).toBeGreaterThanOrEqual(1);
      expect(learnerSubs.every((s) => s.userId === LEARNER_ID)).toBe(true);
    });

    it('tutor can reject a submission with feedback', async () => {
      // Submit another solution
      const sub = await submissions.create({
        taskId,
        userId: 'learner-charlie',
        content: '// incomplete solution',
      });

      const reviewed = await submissions.review(
        sub.id,
        TUTOR_ID,
        SubmissionStatus.REJECTED,
        'This solution does not handle edge cases. Please revise.',
        40,
      );

      expect(reviewed.status).toBe(SubmissionStatus.REJECTED);
      expect(reviewed.score).toBe(40);
    });
  });

  // ═════════════════════════════════════════════════════════════════
  // Journey 4 — Rewards, Streaks & Badges
  // ═════════════════════════════════════════════════════════════════

  describe('Journey 4: Rewards, Streaks & Badges', () => {
    it('awards XP to a learner for completing a task', () => {
      const prog = rewards.addXp(LEARNER_ID, 100);
      expect(prog.xp).toBe(100);
      expect(prog.level).toBe(2); // 100 XP = level 2
    });

    it('tracks progressive XP gain across multiple submissions', () => {
      rewards.addXp(LEARNER_ID, 100);
      rewards.addXp(LEARNER_ID, 300); // Total: 400 → level 3
      const prog = rewards.getUserProgression(LEARNER_ID);
      expect(prog.xp).toBe(400);
      expect(prog.level).toBe(3);
      expect(prog.xpToNextLevel).toBeGreaterThan(0);
    });

    it('daily check-in builds a streak', () => {
      const checkin = streaks.checkIn(LEARNER_ID);
      expect(checkin.newStreak).toBe(1);
      expect(checkin.xpAwarded).toBeGreaterThan(0);
      expect(checkin.message).toContain('Welcome');
    });

    it('prevents double check-in on the same day', () => {
      streaks.checkIn(LEARNER_ID);
      expect(() => streaks.checkIn(LEARNER_ID)).toThrow(/already checked in today/);
    });

    it('awards a badge for first login', () => {
      const result = badges.awardBadge(LEARNER_ID, 'first-login', '0xnft-first-login');
      expect(result.badges).toHaveLength(1);
      expect(result.badges[0].badge.id).toBe('first-login');
      expect(result.badges[0].badge.name).toBe('First Steps');
      expect(result.badges[0].nftTokenId).toBe('0xnft-first-login');
    });

    it('prevents duplicate badge awards', () => {
      badges.awardBadge(LEARNER_ID, 'first-login', '0xnft-first-login');
      const result = badges.awardBadge(LEARNER_ID, 'first-login', '0xnft-another');
      expect(result.badges).toHaveLength(1); // Still only one
    });

    it('throws for unknown badge id', () => {
      expect(() =>
        badges.awardBadge(LEARNER_ID, 'non-existent-badge', '0xnft'),
      ).toThrow(NotFoundException);
    });

    it('returns the leaderboard with correct ordering', () => {
      // Seed multiple learners with different XP
      rewards.addXp('learner-a', 200);
      rewards.addXp('learner-b', 600);
      rewards.addXp('learner-c', 300);

      const { leaderboard, totalParticipants } = rewards.getLeaderboard(5);
      expect(totalParticipants).toBe(3);
      expect(leaderboard[0].userId).toBe('learner-b'); // 600 XP
      expect(leaderboard[0].rank).toBe(1);
    });
  });

  // ═════════════════════════════════════════════════════════════════
  // Journey 5 — Cross-cutting: Social, Challenges & XP
  // ═════════════════════════════════════════════════════════════════

  describe('Journey 5: Social & Challenge Voting', () => {
    it('creates a post and retrieves it after moderation', () => {
      const post = social.createPost(LEARNER_ID, {
        content: 'Just completed my first Rust course! #rust #achievement',
      });

      expect(post.id).toMatch(/^post_/);
      expect(post.moderationStatus).toBe('pending');

      // Post should not appear in feed yet (pending)
      const feedBefore = social.getFeed({});
      expect(feedBefore.posts.find((p) => p.id === post.id)).toBeUndefined();

      // Approve the post
      social.moderatePost(post.id, 'moderator-1', { status: 'approved' });

      // Now it should appear
      const feedAfter = social.getFeed({});
      const found = feedAfter.posts.find((p) => p.id === post.id);
      expect(found).toBeDefined();
      expect(found!.moderationStatus).toBe('approved');
    });

    it('casts and tallies challenge votes', () => {
      const result = challenges.castVote('weekly-challenge-rust-1', {
        userId: LEARNER_ID,
        value: 'up',
      });

      expect(result.upvotes).toBe(1);
      expect(result.downvotes).toBe(0);
      expect(result.score).toBe(1);
      expect(result.userVote).toBe('up');
    });

    it('updates a vote when user changes their mind', () => {
      challenges.castVote('weekly-challenge-rust-1', {
        userId: LEARNER_ID,
        value: 'down',
      });

      const tally = challenges.getTally('weekly-challenge-rust-1');
      expect(tally.upvotes).toBe(0);
      expect(tally.downvotes).toBe(1);
      expect(tally.score).toBe(-1);
    });

    it('follows and unfollows users', () => {
      const follow = social.followUser(LEARNER_ID, TUTOR_ID);
      expect(follow.followerId).toBe(LEARNER_ID);
      expect(follow.followersCount).toBe(1);

      const unfollow = social.unfollowUser(LEARNER_ID, TUTOR_ID);
      expect(unfollow.followersCount).toBe(0);
    });

    it('prevents self-follow', () => {
      expect(() => social.followUser(LEARNER_ID, LEARNER_ID)).toThrow(
        BadRequestException,
      );
    });
  });

  // ═════════════════════════════════════════════════════════════════
  // Journey 6 — Submission resilience (#643 / BA-075)
  // ═════════════════════════════════════════════════════════════════

  describe('Journey 6: Submission Resilience', () => {
    // ── Retry path ─────────────────────────────────────────────────

    it('retry path — a rejected submission can be resubmitted and approved', async () => {
      challenges.setMaxAttempts('challenge-retry-1', 3);

      const first = await submissions.create({
        taskId: 'challenge-retry-1',
        userId: 'learner-retry',
        content: 'fn main() { /* attempt 1 */ }',
      });
      await submissions.review(
        first.id,
        TUTOR_ID,
        SubmissionStatus.REJECTED,
        'Missing edge-case handling. Please revise and resubmit.',
        30,
      );

      // Learner revises and retries
      const second = await submissions.create({
        taskId: 'challenge-retry-1',
        userId: 'learner-retry',
        content: 'fn main() { /* attempt 2 — fixed */ }',
      });
      const reviewed = await submissions.review(
        second.id,
        TUTOR_ID,
        SubmissionStatus.APPROVED,
        'Much better. Approved!',
        90,
      );

      expect(reviewed.status).toBe(SubmissionStatus.APPROVED);

      // Attempt accounting reflects exactly the two submissions
      const info = challenges.getAttemptInfo('challenge-retry-1', 'learner-retry');
      expect(info.current).toBe(2);
      expect(info.remaining).toBe(1);
    });

    it('retry path — draft can be revised and published after rejection', async () => {
      challenges.setMaxAttempts('challenge-retry-draft', 3);

      const draft = await submissions.saveDraft({
        taskId: 'challenge-retry-draft',
        userId: 'learner-draft',
        content: '// work in progress',
      });
      const published = await submissions.publishDraft(draft.id);
      expect(published.status).toBe(SubmissionStatus.PENDING);

      await submissions.review(
        published.id,
        TUTOR_ID,
        SubmissionStatus.NEEDS_REVISION,
        'Add a main function.',
        45,
      );

      // Learner saves a revised draft and publishes it again (retry)
      const draft2 = await submissions.saveDraft({
        taskId: 'challenge-retry-draft',
        userId: 'learner-draft',
        content: 'fn main() { println!("ok"); }',
      });
      const published2 = await submissions.publishDraft(draft2.id);
      expect(published2.status).toBe(SubmissionStatus.PENDING);

      const reviewed = await submissions.review(
        published2.id,
        TUTOR_ID,
        SubmissionStatus.APPROVED,
        'Approved after revision.',
        88,
      );
      expect(reviewed.status).toBe(SubmissionStatus.APPROVED);
    });

    it('retry path — challenge attempt limit blocks further submissions', async () => {
      challenges.setMaxAttempts('challenge-retry-2', 2);

      await submissions.create({
        taskId: 'challenge-retry-2',
        userId: 'learner-blocked',
        content: 'attempt 1',
      });
      await submissions.create({
        taskId: 'challenge-retry-2',
        userId: 'learner-blocked',
        content: 'attempt 2',
      });

      let error: BadRequestException | undefined;
      try {
        await submissions.create({
          taskId: 'challenge-retry-2',
          userId: 'learner-blocked',
          content: 'attempt 3 — must be blocked',
        });
      } catch (err) {
        error = err as BadRequestException;
      }

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error!.getResponse() as Record<string, unknown>).error).toBe(
        'ATTEMPT_LIMIT_EXCEEDED',
      );
    });

    // ── Unauthorized path ──────────────────────────────────────────

    it('unauthorized path — missing token is rejected by the tutor guard', async () => {
      const guard = new JwtTutorGuard(jwt);
      await expect(guard.canActivate(mockHttpContext({}))).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('unauthorized path — learner token is forbidden on tutor endpoints', async () => {
      const learnerToken = jwt.sign({ sub: LEARNER_ID, role: UserRole.LEARNER });
      const guard = new JwtTutorGuard(jwt);

      await expect(
        guard.canActivate(mockHttpContext({ authorization: `Bearer ${learnerToken}` })),
      ).rejects.toThrow(ForbiddenException);
    });

    it('unauthorized path — invalid/expired token is rejected', async () => {
      const guard = new JwtTutorGuard(jwt);
      await expect(
        guard.canActivate(mockHttpContext({ authorization: 'Bearer not-a-real-token' })),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('authorized path — valid tutor token passes the guard', async () => {
      const tutorToken = jwt.sign({ sub: TUTOR_ID, role: UserRole.TUTOR });
      const guard = new JwtTutorGuard(jwt);

      await expect(
        guard.canActivate(mockHttpContext({ authorization: `Bearer ${tutorToken}` })),
      ).resolves.toBe(true);
    });

    // ── Partial-failure path ───────────────────────────────────────

    it('partial-failure path — mixed review outcomes keep the queue consistent', async () => {
      const subA = await submissions.create({
        taskId: 'task-partial-1',
        userId: 'learner-p1',
        content: 'solution A',
      });
      const subB = await submissions.create({
        taskId: 'task-partial-1',
        userId: 'learner-p2',
        content: 'solution B',
      });
      const subC = await submissions.create({
        taskId: 'task-partial-1',
        userId: 'learner-p3',
        content: 'solution C',
      });

      // Two of three submissions resolve; one stays pending
      await tutorReview.reviewSubmission(subA.id, TUTOR_ID, {
        status: SubmissionStatus.APPROVED,
        feedback: 'Approved.',
        score: 95,
      });
      await tutorReview.reviewSubmission(subB.id, TUTOR_ID, {
        status: SubmissionStatus.REJECTED,
        feedback: 'Does not compile.',
        score: 20,
      });

      const stats = await tutorReview.getStats('task-partial-1');
      expect(stats).toMatchObject({
        total: 3,
        approved: 1,
        rejected: 1,
        pending: 1,
        needs_revision: 0,
      });

      // The unresolved submission remains in the pending queue
      const pendingQueue = await tutorReview.getPendingQueue({ taskId: 'task-partial-1' });
      expect(pendingQueue.items.map((s) => s.id)).toEqual([subC.id]);

      // Reviewer history contains the resolved submissions for this task
      const history = await tutorReview.getReviewedByTutor(TUTOR_ID, {});
      const resolvedIds = history.items
        .filter((s) => s.taskId === 'task-partial-1')
        .map((s) => s.id)
        .sort();
      expect(resolvedIds).toEqual([subA.id, subB.id].sort());
    });
  });

  // ═════════════════════════════════════════════════════════════════
  // Journey 7 — Enrollment, Progress & Certificate (#357, #356)
  // ═════════════════════════════════════════════════════════════════

  describe('Journey 7: Enrollment, Completion & Certificate', () => {
    let courseId: string;

    beforeEach(async () => {
      const course = await courses.create({
        title: 'Smart Contracts 101',
        description: 'Build safe Stellar smart contracts.',
        level: CourseLevel.BEGINNER,
        order: 2,
        learningPathId: 'stellar-path-1',
        duration: 60,
        prerequisites: [],
        skills: ['stellar', 'soroban'],
        xpReward: 250,
      });
      courseId = course.id;
    });

    it('enrolls a learner in a course', async () => {
      const enrollment = await courses.enrollUser(LEARNER_ID, courseId);
      expect(enrollment.status).toBe('active');
      expect(enrollment.userId).toBe(LEARNER_ID);

      const userEnrollments = courses.getUserEnrollments(LEARNER_ID);
      expect(userEnrollments).toHaveLength(1);
    });

    it('prevents duplicate enrollment', async () => {
      await courses.enrollUser(LEARNER_ID, courseId);
      await expect(courses.enrollUser(LEARNER_ID, courseId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('completes a course: XP reward, progress and certificate', async () => {
      const completion = await courses.completeCourse(courseId, LEARNER_ID);

      expect(completion.xpAwarded).toBe(250);
      expect(completion.certificate.verificationCode).toBe(`vc-${courseId}`);
      expect(completion.certificate.shareableUrl).toContain('/verify/');
      expect(completion.certificate.issuedAt).toBeInstanceOf(Date);

      // XP was actually recorded on the learner's progression
      const progression = rewards.getUserProgression(LEARNER_ID);
      expect(progression.xp).toBeGreaterThanOrEqual(250);
    });
  });
});
