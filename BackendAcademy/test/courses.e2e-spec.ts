import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CoursesModule } from '../src/courses/courses.module';

describe('Course enrollment REST API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [CoursesModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => app.close());

  it('enforces enrollment at the actual task submission endpoint', async () => {
    const http = request(app.getHttpServer());
    await http.post('/api/courses').send({ courseId: 'rust', title: 'Rust', capacity: 1 }).expect(201);
    await http.post('/api/courses/rust/tasks').send({ taskId: 'ownership' }).expect(201);
    const submission = '/api/courses/rust/tasks/ownership/submissions';
    await http.post(submission).send({ userId: 'alice', submissionId: 's1' }).expect(400);
    await http.post('/api/courses/rust/enrollments').send({ userId: 'alice' }).expect(201);
    await http.post(submission).send({ userId: 'alice', submissionId: 's1' }).expect(201);
    await http.post('/api/courses/rust/enrollments/withdraw').send({ userId: 'alice' }).expect(200);
    await http.post(submission).send({ userId: 'alice', submissionId: 's2' }).expect(400);
  });
});
