import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CLAUDE_CLIENT } from '../src/ai/ai.module';
import { GradingModule } from '../src/grading/grading.module';

/**
 * Feature-scoped e2e for the grading pipeline's HTTP surface.
 *
 * It imports `GradingModule` directly rather than `AppModule`: the global
 * `AppModule` currently pulls in unrelated modules that do not compile on
 * `main`, which would make this suite unrunnable. The global prefix and
 * validation pipe are configured exactly as `src/main.ts` does.
 */
describe('Grading pipeline (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GradingModule],
    })
      .overrideProvider(CLAUDE_CLIENT)
      .useValue({
        complete: async () => ({
          text: '{"score": 91, "feedback": "Excellent ownership and clear error handling."}',
          tokensUsed: 42,
        }),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('walks submit → AI pre-score → tutor override and serves the audit trail', async () => {
    const submit = await request(app.getHttpServer())
      .post('/api/v1/grading/submissions')
      .send({ taskId: 'task-1', learnerId: 'learner-1', content: 'fn main() {}' })
      .expect(201);

    const submissionId = submit.body.submissionId;
    expect(submit.body.status).toBe('submitted');

    const graded = await request(app.getHttpServer())
      .post(`/api/v1/grading/submissions/${submissionId}/ai-pre-score`)
      .expect(201);
    expect(graded.body.status).toBe('ai_graded');
    expect(graded.body.aiPreScore).toMatchObject({ score: 91 });

    const reviewed = await request(app.getHttpServer())
      .post(`/api/v1/grading/submissions/${submissionId}/review`)
      .send({
        tutorId: 'tutor-7',
        decision: 'override',
        score: 75,
        reason: 'Deducted for missing unit tests.',
      })
      .expect(201);
    expect(reviewed.body.status).toBe('tutor_overridden');
    expect(reviewed.body.finalScore).toBe(75);
    expect(reviewed.body.tutorReview).toMatchObject({
      tutorId: 'tutor-7',
      decision: 'override',
      aiScore: 91,
      finalScore: 75,
    });

    const history = await request(app.getHttpServer())
      .get(`/api/v1/grading/submissions/${submissionId}/history`)
      .expect(200);
    expect(
      history.body.transitions.map(
        (entry: { from: string | null; to: string }) => `${entry.from}->${entry.to}`,
      ),
    ).toEqual(['null->submitted', 'submitted->ai_graded', 'ai_graded->tutor_overridden']);
    expect(history.body.transitions[2]).toMatchObject({
      actorId: 'tutor-7',
      actorRole: 'tutor',
      score: 75,
      reason: 'Deducted for missing unit tests.',
    });
  });

  it('rejects an override without a reason', async () => {
    const submit = await request(app.getHttpServer())
      .post('/api/v1/grading/submissions')
      .send({ taskId: 'task-2', learnerId: 'learner-2', content: 'fn main() {}' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/grading/submissions/${submit.body.submissionId}/ai-pre-score`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/grading/submissions/${submit.body.submissionId}/review`)
      .send({ tutorId: 'tutor-7', decision: 'override', score: 50 })
      .expect(400);
  });
});
