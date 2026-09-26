import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ProgressModule } from '../src/progress/progress.module';

describe('Progress tracking REST API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ProgressModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => app.close());

  it('marks a course complete and certificate-eligible once every lesson and task is done', async () => {
    const http = request(app.getHttpServer());

    await http
      .post('/api/v1/progress/courses')
      .send({ courseId: 'ownership-101', lessonIds: ['l1', 'l2'], taskIds: ['t1'] })
      .expect(201);

    const completeLesson = (lessonId: string) =>
      http
        .post('/api/v1/progress/lessons/complete')
        .send({ userId: 'alice', courseId: 'ownership-101', lessonId });
    const completeTask = (taskId: string) =>
      http
        .post('/api/v1/progress/tasks/complete')
        .send({ userId: 'alice', courseId: 'ownership-101', taskId });

    await completeLesson('l1').expect(200);

    let course = await http.get('/api/v1/progress/users/alice/courses/ownership-101').expect(200);
    expect(course.body).toMatchObject({
      lessonCompletionPercent: 50,
      taskCompletionPercent: 0,
      completed: false,
      certificateEligible: false,
    });

    await completeTask('t1').expect(200);
    await completeLesson('l2').expect(200);

    course = await http.get('/api/v1/progress/users/alice/courses/ownership-101').expect(200);
    expect(course.body).toMatchObject({
      lessonsCompleted: 2,
      tasksCompleted: 1,
      lessonCompletionPercent: 100,
      taskCompletionPercent: 100,
      completed: true,
      certificateEligible: true,
      xpEarned: 110,
    });

    const dashboard = await http.get('/api/v1/progress/users/alice/dashboard').expect(200);
    expect(dashboard.body).toMatchObject({ totalXp: 110, coursesCompleted: 1, coursesInProgress: 0 });
    expect(dashboard.body.certificates).toHaveLength(1);

    await http
      .get('/api/v1/progress/users/alice/certificates')
      .expect(200)
      .expect((res) => {
        expect(res.body.certificates[0]).toMatchObject({
          courseId: 'ownership-101',
          status: 'eligible',
        });
      });
  });
});
