import { Test, TestingModule } from "@nestjs/testing";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { INestApplication, Controller, Post, UseGuards } from "@nestjs/common";
import request from "supertest";

@Controller("auth")
class TestAuthController {
  @Post("login")
  login() {
    return { success: true };
  }
}

describe("Auth Throttling (BA-020)", () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 2 }]),
      ],
      controllers: [TestAuthController],
      providers: [
        {
          provide: "APP_GUARD",
          useClass: ThrottlerGuard,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it("should block requests exceeding the rate limit with 429", async () => {
    await request(app.getHttpServer()).post("/auth/login").expect(201);
    await request(app.getHttpServer()).post("/auth/login").expect(201);
    const res = await request(app.getHttpServer()).post("/auth/login");
    expect(res.status).toBe(429);
  });
});
