import { buildCorsOptions } from "./cors.config";
import { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";

type OriginCallback = (err: Error | null, allow?: boolean) => void;
type OriginFn = (origin: string | undefined, cb: OriginCallback) => void;

function resolveOrigin(
  options: CorsOptions,
  origin: string | undefined,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    (options.origin as OriginFn)(origin, (err, allowed) => {
      if (err) reject(err);
      else resolve(!!allowed);
    });
  });
}

describe("buildCorsOptions", () => {
  describe("non-production", () => {
    it("returns origin: true in development", () => {
      const opts = buildCorsOptions({
        nodeEnv: "development",
        allowedOrigins: [],
      });
      expect(opts.origin).toBe(true);
    });

    it("returns origin: true in test", () => {
      const opts = buildCorsOptions({ nodeEnv: "test", allowedOrigins: [] });
      expect(opts.origin).toBe(true);
    });
  });

  describe("production — static origins", () => {
    const opts = buildCorsOptions({
      nodeEnv: "production",
      allowedOrigins: [
        "https:// RustAcademy.to",
        "https://app. RustAcademy.to",
      ],
    });

    it("allows a listed origin", async () => {
      await expect(
        resolveOrigin(opts, "https:// RustAcademy.to"),
      ).resolves.toBe(true);
    });

    it("allows a second listed origin", async () => {
      await expect(
        resolveOrigin(opts, "https://app. RustAcademy.to"),
      ).resolves.toBe(true);
    });

    it("blocks an unlisted origin", async () => {
      await expect(resolveOrigin(opts, "https://evil.com")).rejects.toThrow(
        "Origin not allowed",
      );
    });

    it("allows requests with no origin (server-to-server)", async () => {
      await expect(resolveOrigin(opts, undefined)).resolves.toBe(true);
    });
  });

  describe("production — Vercel preview URLs", () => {
    const opts = buildCorsOptions({
      nodeEnv: "production",
      allowedOrigins: ["https:// RustAcademy.to"],
      vercelProject: " RustAcademy-frontend",
    });

    it("allows a valid Vercel preview URL with hash and team", async () => {
      await expect(
        resolveOrigin(
          opts,
          "https:// RustAcademy-frontend-abc123-team.vercel.app",
        ),
      ).resolves.toBe(true);
    });

    it("allows a preview URL with only a hash segment (no team)", async () => {
      await expect(
        resolveOrigin(
          opts,
          "https:// RustAcademy-frontend-abc123def.vercel.app",
        ),
      ).resolves.toBe(true);
    });

    it("allows a preview URL with uppercase hash characters", async () => {
      await expect(
        resolveOrigin(
          opts,
          "https:// RustAcademy-frontend-AbCdEf12-team.vercel.app",
        ),
      ).resolves.toBe(true);
    });

    it("allows a preview URL with multiple hash-team segments", async () => {
      await expect(
        resolveOrigin(
          opts,
          "https:// RustAcademy-frontend-abc123-def456-team789.vercel.app",
        ),
      ).resolves.toBe(true);
    });

    it("blocks a preview URL for a different project", async () => {
      await expect(
        resolveOrigin(opts, "https://other-project-abc123-team.vercel.app"),
      ).rejects.toThrow("Origin not allowed");
    });

    it("blocks a URL that tries to spoof the project name", async () => {
      await expect(
        resolveOrigin(
          opts,
          "https://evil- RustAcademy-frontend-abc.vercel.app",
        ),
      ).rejects.toThrow("Origin not allowed");
    });

    it("blocks a URL without a hash segment", async () => {
      await expect(
        resolveOrigin(
          opts,
          "https:// RustAcademy-frontend.vercel.app",
        ),
      ).rejects.toThrow("Origin not allowed");
    });

    it("blocks a URL with non-vercel domain", async () => {
      await expect(
        resolveOrigin(
          opts,
          "https:// RustAcademy-frontend-abc123-team.evil-app.com",
        ),
      ).rejects.toThrow("Origin not allowed");
    });

    it("still allows the static production origin", async () => {
      await expect(
        resolveOrigin(opts, "https:// RustAcademy.to"),
      ).resolves.toBe(true);
    });
  });

  describe("production — no wildcard", () => {
    it("does not set origin to true or '*' in production", () => {
      const opts = buildCorsOptions({
        nodeEnv: "production",
        allowedOrigins: ["https:// RustAcademy.to"],
      });
      expect(opts.origin).not.toBe(true);
      expect(opts.origin).not.toBe("*");
    });
  });

  describe("production — Vercel project with special regex characters", () => {
    const opts = buildCorsOptions({
      nodeEnv: "production",
      allowedOrigins: [],
      vercelProject: "my.app_v2",
    });

    it("allows a preview URL when project name contains dots and underscores", async () => {
      await expect(
        resolveOrigin(
          opts,
          "https://my.app_v2-abc123-team.vercel.app",
        ),
      ).resolves.toBe(true);
    });

    it("blocks a URL that uses unescaped regex wildcard", async () => {
      await expect(
        resolveOrigin(
          opts,
          "https://myXappXv2-abc123-team.vercel.app",
        ),
      ).rejects.toThrow("Origin not allowed");
    });
  });

  describe("production — empty CORS_ALLOWED_ORIGINS", () => {
    it("allows requests with no origin (server-to-server) even with empty list", async () => {
      const opts = buildCorsOptions({
        nodeEnv: "production",
        allowedOrigins: [],
      });
      await expect(resolveOrigin(opts, undefined)).resolves.toBe(true);
    });

    it("blocks all origins when allowedOrigins is empty and no vercel project", async () => {
      const opts = buildCorsOptions({
        nodeEnv: "production",
        allowedOrigins: [],
      });
      await expect(
        resolveOrigin(opts, "https://example.com"),
      ).rejects.toThrow("Origin not allowed");
    });
  });

  describe("production — whitespace-only entries filtered", () => {
    it("filters out whitespace-only entries from allowed origins", async () => {
      const opts = buildCorsOptions({
        nodeEnv: "production",
        allowedOrigins: ["  ", "", "  ", "https://real.origin.com"],
      });
      await expect(
        resolveOrigin(opts, "https://real.origin.com"),
      ).resolves.toBe(true);
    });

    it("blocks origins that only match whitespace entries", async () => {
      const opts = buildCorsOptions({
        nodeEnv: "production",
        allowedOrigins: ["  ", "", "  "],
      });
      await expect(
        resolveOrigin(opts, "https://example.com"),
      ).rejects.toThrow("Origin not allowed");
    });
  });

  describe("production — empty string origin", () => {
    it("allows empty string origin (no Origin header)", async () => {
      const opts = buildCorsOptions({
        nodeEnv: "production",
        allowedOrigins: ["https://example.com"],
      });
      await expect(resolveOrigin(opts, undefined)).resolves.toBe(true);
    });
  });

  describe("credentials and headers", () => {
    it("sets credentials: true in production", () => {
      const opts = buildCorsOptions({
        nodeEnv: "production",
        allowedOrigins: [],
      });
      expect(opts.credentials).toBe(true);
    });

    it("includes Authorization in allowedHeaders", () => {
      const opts = buildCorsOptions({
        nodeEnv: "production",
        allowedOrigins: [],
      });
      expect(opts.allowedHeaders).toContain("Authorization");
    });

    it("includes X-API-Key in allowedHeaders", () => {
      const opts = buildCorsOptions({
        nodeEnv: "production",
        allowedOrigins: [],
      });
      expect(opts.allowedHeaders).toContain("X-API-Key");
    });
  });
});
