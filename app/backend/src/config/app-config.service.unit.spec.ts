import { ConfigService } from "@nestjs/config";

import { AppConfigService } from "./app-config.service";
import { EnvConfig } from "./env.schema";

/**
 * Builds an AppConfigService backed by a minimal in-memory ConfigService.
 * Absent keys behave like unset environment variables.
 */
function makeService(values: Partial<EnvConfig>): AppConfigService {
  const fakeConfigService = {
    get: (key: string): unknown => values[key as keyof EnvConfig],
  } as unknown as ConfigService<EnvConfig, true>;

  return new AppConfigService(fakeConfigService);
}

describe("AppConfigService.validate", () => {
  it("returns no errors or warnings for a healthy configuration", () => {
    const service = makeService({
      PORT: 4000,
      NETWORK: "testnet",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_ANON_KEY: "test-anon-key-12345",
      NODE_ENV: "development",
      INGESTION_ENABLED: false,
    });

    expect(service.validate()).toEqual({ errors: [], warnings: [] });
  });

  it("flags missing required dependencies as errors", () => {
    const service = makeService({
      NETWORK: "testnet",
      NODE_ENV: "development",
      INGESTION_ENABLED: false,
    });

    const { errors } = service.validate();
    const joined = errors.join(" ");

    expect(joined).toContain("SUPABASE_URL");
    expect(joined).toContain("SUPABASE_ANON_KEY");
  });

  it("errors when ingestion is enabled without a contract id", () => {
    const service = makeService({ INGESTION_ENABLED: true });

    const { errors } = service.validate();
    const joined = errors.join(" ");

    expect(joined).toContain("INGESTION_ENABLED");
    expect(joined).toContain("RustAcademy_CONTRACT_ID");
  });

  it("warns when STELLAR_SECRET_KEY is set without STELLAR_PUBLIC_KEY", () => {
    const service = makeService({ STELLAR_SECRET_KEY: "S..." });

    expect(service.validate().warnings.join(" ")).toContain(
      "STELLAR_PUBLIC_KEY",
    );
  });

  it("warns in production when no CORS origins are configured", () => {
    const service = makeService({ NODE_ENV: "production" });

    expect(service.validate().warnings.join(" ")).toContain(
      "CORS_ALLOWED_ORIGINS",
    );
  });

  it("does not warn about CORS when a Vercel project is configured", () => {
    const service = makeService({
      NODE_ENV: "production",
      CORS_VERCEL_PROJECT: "rustacademy-frontend",
    });

    expect(service.validate().warnings.join(" ")).not.toContain(
      "CORS_ALLOWED_ORIGINS",
    );
  });
});
