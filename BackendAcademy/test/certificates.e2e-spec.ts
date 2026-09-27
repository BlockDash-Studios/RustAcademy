import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CertificatesModule } from '../src/certificates/certificates.module';

describe('Certification eligibility REST API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [CertificatesModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => app.close());

  it('marks a learner eligible only once every task passes the minimum score', async () => {
    const http = request(app.getHttpServer());

    await http
      .post('/api/v1/certificates/courses')
      .send({ courseId: 'ownership-101', taskIds: ['t1', 't2'], minScore: 70 })
      .expect(201);

    const record = (taskId: string, score: number, userId = 'alice') =>
      http
        .post('/api/v1/certificates/results')
        .send({ userId, courseId: 'ownership-101', taskId, score });

    await record('t1', 80).expect(201);

    let check = await http
      .get('/api/v1/certificates/users/alice/courses/ownership-101/eligibility')
      .expect(200);
    expect(check.body).toMatchObject({
      eligible: false,
      status: 'ineligible',
      tasksRequired: 2,
      tasksPassed: 1,
      finalScore: null,
    });
    expect(check.body.reasons.join(' ')).toMatch(/No graded result/);

    await record('t2', 90).expect(201);

    check = await http
      .get('/api/v1/certificates/users/alice/courses/ownership-101/eligibility')
      .expect(200);
    expect(check.body).toMatchObject({
      eligible: true,
      status: 'eligible',
      tasksPassed: 2,
      averageScore: 85,
      finalScore: 85,
      reasons: [],
    });

    await record('t1', 90, 'bob').expect(201);
    await record('t2', 90, 'bob').expect(201);

    const eligible = await http
      .get('/api/v1/certificates/courses/ownership-101/eligible-learners')
      .expect(200);
    expect(eligible.body.count).toBe(2);
    expect(eligible.body.learners.map((learner: { userId: string }) => learner.userId).sort()).toEqual([
      'alice',
      'bob',
    ]);
  });

  it('rejects criteria with no tasks and scores outside 0–100', async () => {
    const http = request(app.getHttpServer());

    await http.post('/api/v1/certificates/courses').send({ courseId: 'thin', taskIds: [] }).expect(400);

    await http
      .post('/api/v1/certificates/courses')
      .send({ courseId: 'bad-min', taskIds: ['a'], minScore: 150 })
      .expect(400);
  });
});
