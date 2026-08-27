import { INestApplication, Controller, Get, Post, Put, Param, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { AddressInfo } from 'net';

import { ProgressController } from '../courses/progress/progress.controller';
import { ProgressService } from '../courses/progress/progress.service';
import { UserProfileController } from '../users/user-profile.controller';
import { UserProfileService } from '../users/user-profile.service';
import { TutorProfileController } from '../users/tutor-profile.controller';
import { TutorProfileService } from '../users/tutor-profile.service';
import { SubmissionController } from '../submissions/submission.controller';
import { SubmissionService } from '../submissions/submission.service';
import { GradingResultService } from '../submissions/grading-result.service';
import { TutorReviewController } from '../submissions/tutor-review.controller';
import { TutorReviewService } from '../submissions/tutor-review.service';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtAdminGuard } from '../auth/guards/jwt-admin.guard';
import { JwtTutorGuard } from '../auth/guards/jwt-tutor.guard';
import { JwtLearnerGuard } from '../auth/guards/jwt-learner.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SubjectOwnershipGuard } from '../auth/guards/subject-ownership.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Ownership } from '../auth/decorators/ownership.decorator';
import { UserRole } from '../auth/enums/user-role.enum';

const L1 = '10000000-0000-4000-8000-000000000001';
const L2 = '10000000-0000-4000-8000-000000000002';
const T1 = '20000000-0000-4000-8000-000000000001';
const T2 = '20000000-0000-4000-8000-000000000002';
const A1 = '30000000-0000-4000-8000-000000000001';
const PROF_1 = '40000000-0000-4000-8000-000000000001';
const PROF_2 = '40000000-0000-4000-8000-000000000002';
const SUB_L1 = '50000000-0000-4000-8000-000000000001';
const SUB_L2 = '50000000-0000-4000-8000-000000000002';

/**
 * Probe routers that replicate the exact guard wiring applied by BA-018 to
 * routes whose real controllers depend on the half-migrated admin/users
 * service layer (admin.service / reports.service do not compile at HEAD).
 * The guards, decorators, and role/ownership metadata under test are the
 * real production classes.
 */

@Controller('probe/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
class ProbeAdminController {
  @Get('summary')
  summary() {
    return { ok: true };
  }
}

@Controller('probe/users')
@UseGuards(JwtAuthGuard, RolesGuard, SubjectOwnershipGuard)
@Roles(UserRole.LEARNER, UserRole.ADMIN)
@Ownership('userId')
class ProbeUsersController {
  @Put(':userId/preferences')
  updatePreferences(@Param('userId') userId: string) {
    return { userId, learnerPreferences: {}, tutorPreferences: {} };
  }
}

describe('Authorization (roles + subject ownership)', () => {
  let app: INestApplication;
  let port: number;
  let jwt: JwtService;

  const progressService = {
    getSnapshot: jest.fn(),
    getCourseSnapshot: jest.fn(),
    registerCourse: jest.fn(),
    recordLessonCompletion: jest.fn(),
    recordTaskCompletion: jest.fn(),
    resetLearner: jest.fn(),
  } as unknown as ProgressService;

  const userProfileService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findByUserId: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  } as unknown as UserProfileService;

  const tutorProfileService = {
    create: jest.fn(),
    findById: jest.fn(),
    findPending: jest.fn(),
    update: jest.fn(),
    getEarningsSummary: jest.fn(),
    rate: jest.fn(),
    getReviews: jest.fn(),
  } as unknown as TutorProfileService;

  const submissionService = {
    findById: jest.fn(),
    findAll: jest.fn(),
    findByTaskId: jest.fn(),
    findByUserId: jest.fn(),
    findDraftsByUserId: jest.fn(),
    findByStatus: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    review: jest.fn(),
    remove: jest.fn(),
    saveDraft: jest.fn(),
    publishDraft: jest.fn(),
  } as unknown as SubmissionService;

  const gradingResultService = {
    saveResult: jest.fn(),
    getResultsBySubmission: jest.fn(),
    getLatestResult: jest.fn(),
    getResultById: jest.fn(),
    deleteResult: jest.fn(),
  } as unknown as GradingResultService;

  const tutorReviewService = {
    getReviewedByTutor: jest.fn(),
    reviewSubmission: jest.fn(),
  } as unknown as TutorReviewService;

  /**
   * jest.config re-enables mock implementations on every test
   * (clearMocks/resetMocks/restoreMocks, #451), so each mock's fixtures
   * must be re-installed in a beforeEach.
   */
  function reinstallMocks(): void {
    (progressService.getSnapshot as jest.Mock).mockImplementation(async (userId: string) => ({
      userId,
      generatedAt: new Date(),
      overall: {},
      courses: [],
    }));
    (progressService.getCourseSnapshot as jest.Mock).mockResolvedValue(null);
    (progressService.registerCourse as jest.Mock).mockImplementation(async (userId: string) => ({ userId }));
    (progressService.recordLessonCompletion as jest.Mock).mockImplementation(async (userId: string) => ({ userId }));
    (progressService.recordTaskCompletion as jest.Mock).mockImplementation(async (userId: string) => ({ userId }));
    (progressService.resetLearner as jest.Mock).mockResolvedValue(true);

    (userProfileService.create as jest.Mock).mockImplementation(async (dto: any) => ({ id: PROF_2, ...dto }));
    (userProfileService.findAll as jest.Mock).mockResolvedValue([]);
    (userProfileService.findByUserId as jest.Mock).mockResolvedValue(null);
    (userProfileService.findById as jest.Mock).mockImplementation(async (id: string) =>
      id === PROF_1 ? { id: PROF_1, userId: L1 } : null,
    );
    (userProfileService.update as jest.Mock).mockImplementation(async (id: string, dto: any) => ({ id, ...dto }));
    (userProfileService.remove as jest.Mock).mockResolvedValue(true);

    (tutorProfileService.create as jest.Mock).mockImplementation(async (dto: any) => ({ id: PROF_1, ...dto }));
    (tutorProfileService.findById as jest.Mock).mockImplementation(async (id: string) =>
      id === PROF_1 ? { id: PROF_1, userId: T1, bio: 'hello tutor' } : null,
    );
    (tutorProfileService.findPending as jest.Mock).mockResolvedValue([]);
    (tutorProfileService.update as jest.Mock).mockImplementation(async (id: string) => ({ id }));
    (tutorProfileService.getEarningsSummary as jest.Mock).mockImplementation(async (id: string) => ({
      tutorId: id,
      earnedXlm: 0,
      totalPaidOut: 0,
      pendingPayouts: 0,
      payouts: [],
    }));
    (tutorProfileService.rate as jest.Mock).mockImplementation(async (id: string, dto: any) => ({ id, ...dto }));
    (tutorProfileService.getReviews as jest.Mock).mockResolvedValue([]);

    (submissionService.findById as jest.Mock).mockImplementation(async (id: string) => ({
      id,
      userId: id === SUB_L2 ? L2 : L1,
      content: 'x',
    }));
    (submissionService.findAll as jest.Mock).mockResolvedValue([]);
    (submissionService.findByTaskId as jest.Mock).mockResolvedValue([]);
    (submissionService.findByUserId as jest.Mock).mockImplementation(async (userId: string) =>
      userId === L1 ? [{ id: SUB_L1, userId: L1 }] : [],
    );
    (submissionService.findDraftsByUserId as jest.Mock).mockResolvedValue([]);
    (submissionService.findByStatus as jest.Mock).mockResolvedValue([]);
    (submissionService.create as jest.Mock).mockImplementation(async (dto: any) => ({ id: SUB_L1, ...dto }));
    (submissionService.update as jest.Mock).mockImplementation(async (id: string, dto: any) => ({ id, ...dto }));
    (submissionService.review as jest.Mock).mockImplementation(
      async (id: string, reviewerId: string, status: string, feedback?: string, score?: number) => ({ id, reviewedBy: reviewerId }),
    );
    (submissionService.remove as jest.Mock).mockResolvedValue(true);
    (submissionService.saveDraft as jest.Mock).mockImplementation(async (dto: any) => ({ id: SUB_L1, ...dto }));
    (submissionService.publishDraft as jest.Mock).mockImplementation(async (id: string) => ({ id }));

    (gradingResultService.saveResult as jest.Mock).mockImplementation(async (id: string, dto: any) => ({ id, submissionId: id, ...dto }));
    (gradingResultService.getResultsBySubmission as jest.Mock).mockResolvedValue([]);
    (gradingResultService.getLatestResult as jest.Mock).mockResolvedValue(null);
    (gradingResultService.getResultById as jest.Mock).mockResolvedValue({});
    (gradingResultService.deleteResult as jest.Mock).mockResolvedValue(undefined);

    (tutorReviewService.getReviewedByTutor as jest.Mock).mockImplementation(async (tutorId: string) => ({
      items: [],
      total: 0,
      nextCursor: null,
    }));
    (tutorReviewService.reviewSubmission as jest.Mock).mockImplementation(async (id: string, tutorId: string) => ({ id, reviewedBy: tutorId }));
  }

  beforeEach(reinstallMocks);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({ secret: 'test-secret', signOptions: { expiresIn: '5m' } }),
      ],
      controllers: [
        ProbeAdminController,
        ProbeUsersController,
        ProgressController,
        UserProfileController,
        TutorProfileController,
        SubmissionController,
        TutorReviewController,
      ],
      providers: [
        { provide: ProgressService, useValue: progressService },
        { provide: UserProfileService, useValue: userProfileService },
        { provide: TutorProfileService, useValue: tutorProfileService },
        { provide: SubmissionService, useValue: submissionService },
        { provide: GradingResultService, useValue: gradingResultService },
        { provide: TutorReviewService, useValue: tutorReviewService },
        { provide: Reflector, useValue: new Reflector() },
        JwtAuthGuard,
        JwtAdminGuard,
        JwtTutorGuard,
        JwtLearnerGuard,
        RolesGuard,
        SubjectOwnershipGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    const server = await app.listen(0);
    port = (server.address() as AddressInfo).port;
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function signToken(sub: string, role: UserRole): Promise<string> {
    return jwt.sign({ sub, role });
  }

  async function request(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    opts: { token?: string; body?: unknown } = {},
  ) {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: res.status, body };
  }

  describe('Admin route (role-gated)', () => {
    it('rejects unauthenticated requests', async () => {
      const { status } = await request('GET', '/probe/admin/summary');
      expect(status).toBe(401);
    });

    it('rejects non-admin roles', async () => {
      const learner = await signToken(L1, UserRole.LEARNER);
      const { status } = await request('GET', '/probe/admin/summary', { token: learner });
      expect(status).toBe(403);
    });

    it('allows admins', async () => {
      const admin = await signToken(A1, UserRole.ADMIN);
      const { status } = await request('GET', '/probe/admin/summary', { token: admin });
      expect(status).toBe(200);
    });
  });

  describe('Own preferences route (role + subject ownership)', () => {
    it('rejects unauthenticated requests', async () => {
      const { status } = await request('PUT', `/probe/users/${L1}/preferences`);
      expect(status).toBe(401);
    });

    it('rejects tutors on a learner-only route', async () => {
      const tutor = await signToken(T1, UserRole.TUTOR);
      const { status } = await request('PUT', `/probe/users/${T1}/preferences`, { token: tutor });
      expect(status).toBe(403);
    });

    it('allows users to update their own preferences', async () => {
      const learner = await signToken(L1, UserRole.LEARNER);
      const { status } = await request('PUT', `/probe/users/${L1}/preferences`, {
        token: learner,
        body: { learnerPreferences: { theme: 'dark' } },
      });
      expect(status).toBe(200);
    });

    it('blocks cross-user preference updates', async () => {
      const learner2 = await signToken(L2, UserRole.LEARNER);
      const { status } = await request('PUT', `/probe/users/${L1}/preferences`, {
        token: learner2,
        body: { learnerPreferences: { theme: 'dark' } },
      });
      expect(status).toBe(403);
    });

    it('lets admins update any user preferences', async () => {
      const admin = await signToken(A1, UserRole.ADMIN);
      const { status } = await request('PUT', `/probe/users/${L1}/preferences`, {
        token: admin,
        body: { tutorPreferences: { timezone: 'UTC' } },
      });
      expect(status).toBe(200);
    });
  });

  describe('ProgressController (subject-owned learner data)', () => {
    it('rejects unauthenticated requests', async () => {
      const { status } = await request('GET', `/courses/progress/snapshot/${L1}`);
      expect(status).toBe(401);
    });

    it('rejects roles outside learner/admin', async () => {
      const tutor = await signToken(T1, UserRole.TUTOR);
      const { status } = await request('GET', `/courses/progress/snapshot/${T1}`, { token: tutor });
      expect(status).toBe(403);
    });

    it('allows a learner to read their own snapshot', async () => {
      const learner = await signToken(L1, UserRole.LEARNER);
      const { status } = await request('GET', `/courses/progress/snapshot/${L1}`, { token: learner });
      expect(status).toBe(200);
      expect(progressService.getSnapshot).toHaveBeenCalledWith(L1);
    });

    it('blocks cross-user access', async () => {
      const learner2 = await signToken(L2, UserRole.LEARNER);
      const { status, body } = await request('GET', `/courses/progress/snapshot/${L1}`, { token: learner2 });
      expect(status).toBe(403);
      expect(body).toMatchObject({ error: 'SUBJECT_MISMATCH' });
    });

    it('lets admins read any snapshot', async () => {
      const admin = await signToken(A1, UserRole.ADMIN);
      const { status } = await request('GET', `/courses/progress/snapshot/${L1}`, { token: admin });
      expect(status).toBe(200);
    });
  });

  describe('UserProfileController (own profile)', () => {
    it('binds the profile to the authenticated subject on create', async () => {
      const learner = await signToken(L1, UserRole.LEARNER);
      const { status } = await request('POST', '/user-profiles', {
        token: learner,
        body: { userId: L2, displayName: 'spoofed' },
      });
      expect(status).toBe(201);
      expect(userProfileService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: L1 }),
      );
    });

    it('rejects cross-user profile updates', async () => {
      const learner2 = await signToken(L2, UserRole.LEARNER);
      const { status } = await request('PUT', `/user-profiles/${PROF_1}`, {
        token: learner2,
        body: { displayName: 'hijacked' },
      });
      expect(status).toBe(403);
    });

    it('allows the owner to update their profile', async () => {
      const learner = await signToken(L1, UserRole.LEARNER);
      const { status } = await request('PUT', `/user-profiles/${PROF_1}`, {
        token: learner,
        body: { displayName: 'me' },
      });
      expect(status).toBe(200);
    });
  });

  describe('TutorProfileController (own profile + admin-only listing)', () => {
    it('rejects unauthenticated earnings access', async () => {
      const { status } = await request('GET', `/tutors/${PROF_1}/earnings`);
      expect(status).toBe(401);
    });

    it('blocks a tutor from viewing another tutor earnings', async () => {
      const tutor2 = await signToken(T2, UserRole.TUTOR);
      const { status } = await request('GET', `/tutors/${PROF_1}/earnings`, { token: tutor2 });
      expect(status).toBe(403);
    });

    it('allows the owning tutor to view their earnings', async () => {
      const tutor1 = await signToken(T1, UserRole.TUTOR);
      const { status } = await request('GET', `/tutors/${PROF_1}/earnings`, { token: tutor1 });
      expect(status).toBe(200);
    });

    it('restricts the pending-verification listing to admins', async () => {
      const learner = await signToken(L1, UserRole.LEARNER);
      const tutor = await signToken(T1, UserRole.TUTOR);
      expect((await request('GET', '/tutors/pending', { token: learner })).status).toBe(403);
      expect((await request('GET', '/tutors/pending', { token: tutor })).status).toBe(403);
      const admin = await signToken(A1, UserRole.ADMIN);
      expect((await request('GET', '/tutors/pending', { token: admin })).status).toBe(200);
    });

    it('prevents a tutor from rating their own profile', async () => {
      const tutor1 = await signToken(T1, UserRole.TUTOR);
      const { status, body } = await request('POST', `/tutors/${PROF_1}/rate`, {
        token: tutor1,
        body: { rating: 5 },
      });
      expect(status).toBe(403);
      expect(body).toMatchObject({ error: 'SELF_RATE_FORBIDDEN' });
    });

    it('binds the rater subject to the JWT when rating another tutor', async () => {
      const learner = await signToken(L1, UserRole.LEARNER);
      const { status } = await request('POST', `/tutors/${PROF_1}/rate`, {
        token: learner,
        body: { raterUserId: T2, rating: 5 },
      });
      expect(status).toBe(201);
      expect(tutorProfileService.rate).toHaveBeenCalledWith(
        PROF_1,
        expect.objectContaining({ raterUserId: L1 }),
      );
    });
  });

  describe('TutorReviewController (tutor role declared)', () => {
    it('rejects learners', async () => {
      const learner = await signToken(L1, UserRole.LEARNER);
      const { status } = await request('GET', '/tutor/review/history', { token: learner });
      expect(status).toBe(403);
    });

    it('scopes review history to the calling tutor', async () => {
      const tutor1 = await signToken(T1, UserRole.TUTOR);
      const { status } = await request('GET', '/tutor/review/history', { token: tutor1 });
      expect(status).toBe(200);
      expect(tutorReviewService.getReviewedByTutor).toHaveBeenCalledWith(T1, expect.anything());
    });
  });

  describe('SubmissionController (learner subject ownership)', () => {
    it('forces the author user id from the JWT on create', async () => {
      const learner1 = await signToken(L1, UserRole.LEARNER);
      const { status } = await request('POST', '/submissions', {
        token: learner1,
        body: { taskId: 'task-1', userId: L2, content: 'answer' },
      });
      expect(status).toBe(201);
      expect(submissionService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: L1 }),
      );
    });

    it('rejects unauthenticated submissions', async () => {
      const { status } = await request('POST', '/submissions', {
        body: { taskId: 'task-1', userId: L1, content: 'answer' },
      });
      expect(status).toBe(401);
    });

    it('allows a learner to list their own submissions', async () => {
      const learner1 = await signToken(L1, UserRole.LEARNER);
      const { status } = await request('GET', `/submissions/user/${L1}`, { token: learner1 });
      expect(status).toBe(200);
    });

    it('blocks cross-user submission listing', async () => {
      const learner2 = await signToken(L2, UserRole.LEARNER);
      const { status } = await request('GET', `/submissions/user/${L1}`, { token: learner2 });
      expect(status).toBe(403);
    });

    it('restricts the global listing to tutors/admins', async () => {
      const learner = await signToken(L1, UserRole.LEARNER);
      const tutor = await signToken(T1, UserRole.TUTOR);
      expect((await request('GET', '/submissions', { token: learner })).status).toBe(403);
      expect((await request('GET', '/submissions', { token: tutor })).status).toBe(200);
    });

    it('blocks cross-user submission updates', async () => {
      const learner1 = await signToken(L1, UserRole.LEARNER);
      const { status } = await request('PUT', `/submissions/${SUB_L2}`, {
        token: learner1,
        body: { content: 'overwritten' },
      });
      expect(status).toBe(403);
    });

    it('allows the owning learner to update their submission', async () => {
      const learner2 = await signToken(L2, UserRole.LEARNER);
      const { status } = await request('PUT', `/submissions/${SUB_L2}`, {
        token: learner2,
        body: { content: 'fixed' },
      });
      expect(status).toBe(200);
    });

    it('restricts review to tutors/admins and binds the reviewer id', async () => {
      const learner = await signToken(L1, UserRole.LEARNER);
      expect((await request('POST', `/submissions/${SUB_L1}/review`, {
        token: learner,
        body: { status: 'approved' },
      })).status).toBe(403);

      const tutor1 = await signToken(T1, UserRole.TUTOR);
const { status } = await request('POST', `/submissions/${SUB_L1}/review`, {
        token: tutor1,
        body: { status: 'approved', feedback: 'nice' },
      });
      expect(status).toBe(201);
      expect(submissionService.review).toHaveBeenCalledWith(SUB_L1, T1, 'approved', 'nice', undefined);
    });

    it('binds the grader id to the JWT subject for grading', async () => {
      const tutor1 = await signToken(T1, UserRole.TUTOR);
      const { status } = await request('POST', `/submissions/${SUB_L1}/grade`, {
        token: tutor1,
        body: { graderId: 'someone-else', status: 'pass', score: 10, maxScore: 10, feedback: 'ok' },
      });
      expect(status).toBe(201);
      expect(gradingResultService.saveResult).toHaveBeenCalledWith(
        SUB_L1,
        expect.objectContaining({ graderId: T1 }),
      );
    });
  });
});