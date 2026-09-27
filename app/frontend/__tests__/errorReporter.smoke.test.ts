/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorReporter, redactPII, extractCodeOrigin } from "@/lib/errorReporter";

describe("errorReporter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.NEXT_PUBLIC_ERROR_REPORTING_ENABLED = "false";
    process.env.NEXT_PUBLIC_ERROR_REPORTING_URL = "";
    process.env.NEXT_PUBLIC_APP_VERSION = "test-version";
    process.env.NEXT_PUBLIC_VERCEL_ENV = "preview";
    global.fetch = vi.fn();
  });

  it("redacts email, phone, and card patterns", () => {
    const payload = {
      email: "alice@example.com",
      phone: "+1 (555) 123-4567",
      card: "4111 1111 1111 1111",
      nested: {
        note: "Contact bob@work-mail.com or 555-987-6543.",
      },
    };

    const redacted = redactPII(payload) as Record<string, unknown>;

    expect(redacted.email).toBe("[REDACTED_EMAIL]");
    expect(redacted.phone).toBe("[REDACTED_PHONE]");
    expect(redacted.card).toBe("[REDACTED_CARD]");
    expect(
      (redacted.nested as Record<string, unknown>).note
    ).toContain("[REDACTED_EMAIL]");
    expect(
      (redacted.nested as Record<string, unknown>).note
    ).toContain("[REDACTED_PHONE]");
  });

  it("redacts Stellar secret keys, Bearer tokens, JWTs, API keys, passwords, and sensitive object keys", () => {
    const sensitivePayload = {
      secretKey: "SBEXAMPLESECRETKEY12345678901234567890123456789012345678901234",
      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakSignatureHere123",
      authorization: "Bearer secret-token-abc-123",
      password: "SuperSecretPassword123!",
      apiKey: "api_key_live_998877665544332211",
      regularField: "Hello World",
      nestedSecrets: {
        rawMessage: "Using secret=my_db_secret and password=hidden_pwd with SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      },
    };

    const redacted = redactPII(sensitivePayload) as Record<string, unknown>;

    expect(redacted.secretKey).toBe("[REDACTED]");
    expect(redacted.token).toBe("[REDACTED]");
    expect(redacted.authorization).toBe("[REDACTED]");
    expect(redacted.password).toBe("[REDACTED]");
    expect(redacted.apiKey).toBe("[REDACTED]");
    expect(redacted.regularField).toBe("Hello World");
    expect(
      (redacted.nestedSecrets as Record<string, unknown>).rawMessage
    ).toContain("[REDACTED_SECRET]");
    expect(
      (redacted.nestedSecrets as Record<string, unknown>).rawMessage
    ).toContain("[REDACTED_PASSWORD]");
    expect(
      (redacted.nestedSecrets as Record<string, unknown>).rawMessage
    ).toContain("[REDACTED_SECRET_KEY]");
  });

  it("extracts code origin from stack trace", () => {
    const fakeStack = `Error: Something failed\n    at DashboardView (Dashboard.tsx:42:15)\n    at renderWithHooks (react-dom.js:123:45)`;
    const origin = extractCodeOrigin(fakeStack);
    expect(origin).toBe("at DashboardView (Dashboard.tsx:42:15)");
  });

  it("does not send when reporting is disabled", async () => {
    process.env.NEXT_PUBLIC_ERROR_REPORTING_ENABLED = "false";
    await errorReporter.captureError(new Error("test"));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("sends payload with route context, code origin, and metadata when reporting is enabled", async () => {
    process.env.NEXT_PUBLIC_ERROR_REPORTING_ENABLED = "true";
    process.env.NEXT_PUBLIC_ERROR_REPORTING_URL = "https://example.com/api/errors";
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch as unknown as typeof fetch;

    const error = new Error("Server failed to load");
    error.stack = "Error: Server failed to load\n    at PaymentProcessor (PaymentProcessor.tsx:88:12)";

    await errorReporter.captureError(error, {
      requestId: "req-123",
      correlationId: "corr-456",
      userId: "user-789",
      route: "/dashboard",
      codeOrigin: "PaymentProcessor.tsx",
      componentStack: "at Dashboard (Dashboard.tsx:10)",
      extra: { feature: "payment", password: "should-be-redacted" },
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://example.com/api/errors");
    expect(options).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const body = JSON.parse(options.body as string);
    expect(body).toHaveProperty("timestamp");
    expect(body.error.message).toBe("Server failed to load");
    expect(body.context.requestId).toBe("req-123");
    expect(body.context.correlationId).toBe("corr-456");
    expect(body.context.route).toBe("/dashboard");
    expect(body.context.codeOrigin).toBe("PaymentProcessor.tsx");
    expect(body.context.extra.password).toBe("[REDACTED]");
    expect(body.appVersion).toBe("test-version");
    expect(body.environment).toBe("preview");
  });

  it("gracefully catches fetch errors without throwing", async () => {
    process.env.NEXT_PUBLIC_ERROR_REPORTING_ENABLED = "true";
    process.env.NEXT_PUBLIC_ERROR_REPORTING_URL = "https://example.com/api/errors";
    global.fetch = vi.fn().mockRejectedValue(new Error("Network connection down"));

    await expect(
      errorReporter.captureError(new Error("Component crashed"))
    ).resolves.not.toThrow();
  });
});
