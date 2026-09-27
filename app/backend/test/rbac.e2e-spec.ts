import {
  Controller,
  INestApplication,
  Injectable,
  Post,
} from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test, TestingModule } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import request from "supertest";

import { CustomThrottlerGuard } from "../src/auth/guards/custom-throttler.guard";
import { ApiKeyGuard } from "../src/auth/guards/api-key.guard";
import { SensitiveMutation } from "../src/auth/decorators/sensitive-mutation.decorator";
import { throttlerModuleProfiles } from "../src/config/rate-limit.config";
import { AuditService } from "../src/audit/audit.service";
import { AuditController } from "../src/audit/audit.controller";
import { ApiKeysService } from "../src/api-keys/api-keys.service";
import { SupabaseService } from "../src/supabase/supabase.service";
import { MetricsService } from "../src/metrics/metrics.service";

/**
 * Issue #551 — Harden rate limiting and audit trails for sensitive mutations.
 *
 * Covers:
 *   - "sensitive" mutations get a stricter per-user (identity) limit AND an
 *     independent per-IP limit, both enforced (not just whichever identity
 *     resolves first).
 *   - a tripped sensitive limit is itself audit-logged (explicit anomaly
 *     handling), on top of the metrics counter.
 *   - a successful sensitive mutation is audit-logged with actor/route/
 *     request context via @SensitiveMutation()/AuditInterceptor.
 *   - the admin audit endpoints reject callers without the "admin" API key
 *     scope and allow callers with it.
 */

@Injectable()
class RecordingMetricsService {
  recordRateLimitedRequest = jest.fn();
}

@Controller("sensitive-test")
class SensitiveTestController {
  @Post("action")
  @SensitiveMutation("test.sensitive_action")
  action() {
    return { ok: true };
  }
}

describe("Sensitive mutation rate limiting (e2e)", () => {
  let app: INestApplication;
  let auditLogSpy: jest.Mock;
  let metrics: RecordingMetricsService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot(throttlerModuleProfiles)],
      controllers: [SensitiveTestController],
      providers: [
        {
          provide: AuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: MetricsService, useClass: RecordingMetricsService },
        { provide: APP_GUARD, useClass: CustomThrottlerGuard },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    auditLogSpy = moduleFixture.get(AuditService).log as jest.Mock;
    metrics = moduleFixture.get(MetricsService);
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it("allows requests within the sensitive burst limit and audit-logs each one", async () => {
    const limit = throttlerModuleProfiles.find(
      (p) => p.name === "sensitive_burst",
    )!.limit;

    for (let i = 0; i < limit; i++) {
      await request(app.getHttpServer())
        .post("/sensitive-test/action")
        .set("x-user-id", "user-fixed")
        .expect(201);
    }

    const successLogs = auditLogSpy.mock.calls.filter(
      ([, action]) => action === "test.sensitive_action",
    );
    expect(successLogs).toHaveLength(limit);
    expect(successLogs[0][0]).toBe("user_id:user-fixed");
  });

  it("throttles a single user past the per-user burst limit and audit-logs the anomaly", async () => {
    const limit = throttlerModuleProfiles.find(
      (p) => p.name === "sensitive_burst",
    )!.limit;

    for (let i = 0; i < limit; i++) {
      await request(app.getHttpServer())
        .post("/sensitive-test/action")
        .set("x-user-id", "user-hammer")
        .set("x-forwarded-for", "203.0.113.10")
        .expect(201);
    }

    const res = await request(app.getHttpServer())
      .post("/sensitive-test/action")
      .set("x-user-id", "user-hammer")
      .set("x-forwarded-for", "203.0.113.10")
      .expect(429);

    expect(res.headers["retry-after"]).toBeDefined();
    expect(metrics.recordRateLimitedRequest).toHaveBeenCalledWith(
      "POST",
      expect.stringContaining("/sensitive-test/action"),
      "sensitive",
      "user_id",
    );

    const anomalyLogs = auditLogSpy.mock.calls.filter(
      ([, action]) => action === "rate_limit.sensitive_exceeded",
    );
    expect(anomalyLogs).toHaveLength(1);
    expect(anomalyLogs[0][0]).toBe("user_id:user-hammer");
  });

  it("throttles one IP cycling through many identities, independent of the per-user limit", async () => {
    const ipLimit = throttlerModuleProfiles.find(
      (p) => p.name === "sensitive_ip_burst",
    )!.limit;

    // Each request uses a distinct user id, so the per-user limiter never
    // trips — only the always-IP-keyed limiter should catch this pattern.
    for (let i = 0; i < ipLimit; i++) {
      await request(app.getHttpServer())
        .post("/sensitive-test/action")
        .set("x-user-id", `user-${i}`)
        .set("x-forwarded-for", "198.51.100.20")
        .expect(201);
    }

    const res = await request(app.getHttpServer())
      .post("/sensitive-test/action")
      .set("x-user-id", "user-new")
      .set("x-forwarded-for", "198.51.100.20")
      .expect(429);

    expect(res.headers["retry-after"]).toBeDefined();

    // A different IP, brand-new user, is unaffected.
    await request(app.getHttpServer())
      .post("/sensitive-test/action")
      .set("x-user-id", "user-elsewhere")
      .set("x-forwarded-for", "203.0.113.99")
      .expect(201);
  });
});

describe("Admin audit endpoints (e2e)", () => {
  let app: INestApplication;
  let validateKeyMock: jest.Mock;

  beforeEach(async () => {
    validateKeyMock = jest.fn();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [
        AuditService,
        {
          provide: SupabaseService,
          // Force AuditService's Supabase path to fail so it exercises its
          // documented in-memory fallback — no real database needed.
          useValue: {
            getClient: () => {
              throw new Error("no supabase in this test");
            },
          },
        },
        ApiKeyGuard,
        {
          provide: ApiKeysService,
          useValue: {
            validateKey: validateKeyMock,
            isOverQuota: jest.fn().mockReturnValue(false),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it("rejects querying the audit trail with a non-admin-scoped API key", async () => {
    validateKeyMock.mockResolvedValue({
      record: { id: "key-1", scopes: ["links:read"] },
      hasScope: (scope: string) => scope === "links:read",
    });

    await request(app.getHttpServer())
      .get("/admin/audit")
      .set("x-api-key", "some-key")
      .expect(403);
  });

  it("allows querying the audit trail with an admin-scoped API key", async () => {
    validateKeyMock.mockResolvedValue({
      record: { id: "key-1", scopes: ["admin"] },
      hasScope: (scope: string) => scope === "admin",
    });

    await request(app.getHttpServer())
      .get("/admin/audit")
      .set("x-api-key", "admin-key")
      .expect(200);
  });

  it("rejects an invalid API key on the destructive retention endpoint", async () => {
    validateKeyMock.mockResolvedValue(null);

    await request(app.getHttpServer())
      .delete("/admin/audit/retention")
      .set("x-api-key", "bogus")
      .expect(401);
  });

  it("applies the retention policy for an admin-scoped caller", async () => {
    validateKeyMock.mockResolvedValue({
      record: { id: "key-1", scopes: ["admin"] },
      hasScope: (scope: string) => scope === "admin",
    });

    const res = await request(app.getHttpServer())
      .delete("/admin/audit/retention")
      .set("x-api-key", "admin-key")
      .expect(200);

    expect(res.body).toHaveProperty("deletedCount");
  });
});
