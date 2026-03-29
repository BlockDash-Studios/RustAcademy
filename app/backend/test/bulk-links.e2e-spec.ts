import * as request from 'supertest';

describe('Bulk Links (e2e)', () => {
  it('should generate 100+ links', async () => {
    const payload = Array.from({ length: 120 }).map((_, i) => ({
      customerName: `User ${i}`,
      email: `user${i}@test.com`,
      amount: 100 + i,
    }));

    const res = await request(global.app.getHttpServer())
      .post('/bulk-links/json')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.length).toBe(120);
  });
});