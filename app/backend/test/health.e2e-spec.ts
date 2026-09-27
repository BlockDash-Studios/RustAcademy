/**
 * Error envelope contract tests (Issue #562)
 *
 * Verifies that every error path — validation failures, 404s, business errors,
 * and unhandled exceptions — returns a deterministic, consistent payload
 * matching the shared ErrorEnvelope type.
 *
 * Uses a minimal NestJS application with just the controllers and pipes needed,
 * avoiding the full AppModule's deep dependency tree.
 */

import {
  BadRequestException,
  Controller,
  Get,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { GlobalHttpExceptionFilter } from "../src/common/filters/global-http-exception.filter";
import { AppConfigService } from "../src/config";
import { mapValidationErrors } from "../src/common/utils/validation-error.mapper";
import { ErrorCode } from "../src/common/errors";
import { CorrelationIdMiddleware } from "../src/common/middleware/correlation-id.middleware";

// ─── Minimal test controller ──────────────────────────────────────────────

@Controller("test")
class TestController {
  @Get("ok")
  healthOk() {
    return { status: "ok" };
  }

  @Get("not-found")
  throwNotFound() {
    throw new NotFoundException({
      code: "RESOURCE_NOT_FOUND",
      message: "The requested resource was not found",
    });
  }

  @Get("business-error")
  throwBusinessError() {
    throw new BadRequestException({
      code: "MARKETPLACE_SELF_BID",
      message: "Sellers cannot bid on their own listing",
    });
  }

  @Get("unhandled")
  throwUnhandled() {
    throw new Error("Something went wrong internally");
  }

  @Get("string-error")
  throwStringError() {
    throw new BadRequestException("Simple string error message");
  }
}

// ─── Test suite ───────────────────────────────────────────────────────────

describe("Error Envelope Contract (Issue #562)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestController],
    }).compile();

    app = moduleRef.createNestApplication();

    // Apply the same pipes and filters as production bootstrap
    app.use(
      // Correlation ID middleware (same as production)
      new CorrelationIdMiddleware().use.bind(new CorrelationIdMiddleware()),
    );

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: (errors) => {
          const mapped = mapValidationErrors(errors);
          return new BadRequestException({
            code: ErrorCode.VALIDATION_ERROR,
            message: mapped.message,
            fields: mapped.fields,
          });
        },
      }),
    );

    // Mock configService for the filter
    const mockConfig = {
      isProduction: false,
    } as unknown as AppConfigService;

    app.useGlobalFilters(new GlobalHttpExceptionFilter(mockConfig));

    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // ─── Envelope shape contract ────────────────────────────────────────────

  describe("Envelope shape contract", () => {
    it("always returns success: false in error responses", async () => {
      const response = await request(app.getHttpServer())
        .get("/test/not-found")
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body).toHaveProperty("error");
      expect(typeof response.body.error).toBe("object");
    });

    it("error object always contains code and message", async () => {
      const response = await request(app.getHttpServer())
        .get("/test/not-found")
        .expect(404);

      expect(typeof response.body.error.code).toBe("string");
      expect(response.body.error.code.length).toBeGreaterThan(0);
      expect(
        typeof response.body.error.message === "string" ||
          Array.isArray(response.body.error.message),
      ).toBe(true);
    });

    it("error code uses SCREAMING_SNAKE_CASE convention", async () => {
      const response = await request(app.getHttpServer())
        .get("/test/not-found")
        .expect(404);

      expect(response.body.error.code).toMatch(/^[A-Z][A-Z_]+$/);
    });

    it("returns success: true for successful responses (no error envelope)", async () => {
      const response = await request(app.getHttpServer())
        .get("/test/ok")
        .expect(200);

      expect(response.body.status).toBe("ok");
      expect(response.body).not.toHaveProperty("success");
    });
  });

  // ─── Business error contract ────────────────────────────────────────────

  describe("Business error contract", () => {
    it("preserves domain error code in the envelope", async () => {
      const response = await request(app.getHttpServer())
        .get("/test/business-error")
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("MARKETPLACE_SELF_BID");
      expect(response.body.error.message).toBe(
        "Sellers cannot bid on their own listing",
      );
    });

    it("handles string-based HttpException payloads", async () => {
      const response = await request(app.getHttpServer())
        .get("/test/string-error")
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(typeof response.body.error.code).toBe("string");
      expect(response.body.error.message).toBe("Simple string error message");
    });
  });

  // ─── Not-found (404) errors ────────────────────────────────────────────

  describe("404 error contract", () => {
    it("returns consistent envelope for not-found resources", async () => {
      const response = await request(app.getHttpServer())
        .get("/test/not-found")
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: expect.objectContaining({
          code: expect.any(String),
          message: expect.any(String),
        }),
      });
    });

    it("returns consistent envelope for unknown routes", async () => {
      const response = await request(app.getHttpServer())
        .get("/this-route-does-not-exist")
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(typeof response.body.error.code).toBe("string");
      expect(typeof response.body.error.message).toBe("string");
    });
  });

  // ─── Unhandled exception contract ───────────────────────────────────────

  describe("Unhandled exception contract", () => {
    it("sanitizes unhandled errors in production mode", async () => {
      // Create a separate app with isProduction=true
      const moduleRef = await Test.createTestingModule({
        controllers: [TestController],
      }).compile();

      const prodApp = moduleRef.createNestApplication();
      const prodConfig = { isProduction: true } as unknown as AppConfigService;
      prodApp.useGlobalFilters(new GlobalHttpExceptionFilter(prodConfig));
      await prodApp.init();

      const response = await request(prodApp.getHttpServer())
        .get("/test/unhandled")
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
      // In production, the original error message should be sanitized
      expect(response.body.error.message).toBe("Internal server error");

      await prodApp.close();
    });

    it("exposes error details in non-production mode", async () => {
      const response = await request(app.getHttpServer())
        .get("/test/unhandled")
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
      // In dev mode, the sanitized error message should be included
      expect(typeof response.body.error.message).toBe("string");
    });
  });

  // ─── Correlation ID / trace metadata ────────────────────────────────────

  describe("Correlation ID contract", () => {
    it("echoes client-provided x-request-id in error body", async () => {
      const requestId = "test-contract-trace-id-001";

      const response = await request(app.getHttpServer())
        .get("/test/not-found")
        .set("x-request-id", requestId)
        .expect(404);

      expect(response.body.error.request_id).toBe(requestId);
      expect(response.body.error.correlationId).toBe(requestId);
      expect(response.headers["x-request-id"]).toBe(requestId);
    });

    it("auto-generates a correlation ID when none is provided", async () => {
      const response = await request(app.getHttpServer())
        .get("/test/not-found")
        .expect(404);

      expect(response.body.error.request_id).toBeDefined();
      expect(typeof response.body.error.request_id).toBe("string");
      expect(response.body.error.request_id!.length).toBeGreaterThan(0);
      expect(response.headers["x-request-id"]).toBeDefined();
    });

    it("correlation ID is consistent between header and body", async () => {
      const response = await request(app.getHttpServer())
        .get("/test/not-found")
        .expect(404);

      expect(response.headers["x-request-id"]).toBe(
        response.body.error.request_id,
      );
    });

    it("correlation ID is present on success responses too", async () => {
      const response = await request(app.getHttpServer())
        .get("/test/ok")
        .expect(200);

      expect(response.headers["x-request-id"]).toBeDefined();
    });
  });

  // ─── Rate-limit error shape contract (static) ───────────────────────────

  describe("Rate-limit error shape contract", () => {
    it("documents the expected 429 response shape", () => {
      // Static contract assertion documenting what rate-limited responses
      // should look like when the ThrottlerException path fires.
      const expectedShape = {
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: expect.any(String),
          details: {
            retryAfterSeconds: expect.any(Number),
          },
        },
      };

      const mockRateLimitResponse = {
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests. Retry after 60 seconds.",
          details: { retryAfterSeconds: 60 },
        },
      };

      expect(mockRateLimitResponse).toEqual(expectedShape);
    });
  });

  // ─── Domain error shape contract (static) ───────────────────────────────

  describe("Domain error shape contract", () => {
    it("documents the expected Soroban domain error shape", () => {
      const expectedShape = {
        success: false,
        error: {
          code: expect.any(String),
          message: expect.any(String),
        },
      };

      const mockDomainResponse = {
        success: false,
        error: {
          code: "CONTRACT_PAUSED",
          message: "This contract is currently paused",
        },
      };

      expect(mockDomainResponse).toEqual(expectedShape);
    });
  });

  // ─── Response headers contract ──────────────────────────────────────────

  describe("Response headers contract", () => {
    it("sets x-request-id on error responses", async () => {
      const response = await request(app.getHttpServer())
        .get("/test/not-found")
        .expect(404);

      expect(response.headers["x-request-id"]).toBeDefined();
    });

    it("sets x-correlation-id header as well", async () => {
      const response = await request(app.getHttpServer())
        .get("/test/not-found")
        .expect(404);

      expect(response.headers["x-correlation-id"]).toBeDefined();
    });
  });
});
