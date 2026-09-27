import { ApiProperty } from "@nestjs/swagger";

// Response shape for a basic liveness/health check endpoint
// (e.g. GET /health), used to confirm the service process is up.
export class HealthResponseDto {
  @ApiProperty({ example: "ok" })
  status: string;

  @ApiProperty({ example: "0.1.0" })
  version: string;

  @ApiProperty({ example: 3600, description: "Uptime in seconds" })
  uptime: number;
}

// Represents the result of a single dependency check (e.g. database,
// cache, message queue) performed as part of an overall readiness check.
export class ReadyCheckDto {
  // Name of the dependency being checked (e.g. "supabase", "redis").
  @ApiProperty({ example: "supabase" })
  name: string;

  // Whether this specific dependency is currently reachable/healthy.
  @ApiProperty({ enum: ["up", "down"] })
  status: "up" | "down";

  // Optional round-trip latency observed for this check, as a display string.
  @ApiProperty({ example: "125ms", required: false })
  latency?: string;

  // Optional extra human-readable notes about this check
  // (e.g. confirming required env vars/config were loaded).
  @ApiProperty({
    example: ["All critical env variables loaded"],
    required: false,
    type: [String],
  })
  details?: string[];

  // Optional timestamp of the last time this check succeeded,
  // useful when the current check is failing.
  @ApiProperty({ example: "2024-01-01T00:00:00.000Z", required: false })
  lastSuccess?: string;

  // Optional error message describing why the check failed, if it did.
  @ApiProperty({ example: "Connection timeout", required: false })
  error?: string;

  // Optional lag (in seconds), relevant for checks on data ingestion/
  // replication pipelines rather than simple up/down connectivity checks.
  @ApiProperty({
    example: 5,
    required: false,
    description: "Lag in seconds for ingestion checks",
  })
  lagSeconds?: number;
}

// Response shape for a readiness check endpoint (e.g. GET /ready), used
// by orchestrators (e.g. Kubernetes) to decide whether the service should
// receive traffic. Aggregates the results of all individual dependency checks.
export class ReadyResponseDto {
  // Overall readiness: true only if all checks pass (implementation-dependent).
  @ApiProperty({ example: true })
  ready: boolean;

  // When this readiness check was performed.
  @ApiProperty({
    example: "2024-01-01T00:00:00.000Z",
    description: "Timestamp of the readiness check",
  })
  timestamp: string;

  // Breakdown of each individual dependency check that contributed
  // to the overall `ready` result.
  @ApiProperty({ type: [ReadyCheckDto] })
  checks: ReadyCheckDto[];
}
