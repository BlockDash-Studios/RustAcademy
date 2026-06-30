import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { SchemaObservabilityService, ParserHealthSummary } from "./schema-observability.service";

/**
 * Developer-facing endpoint for parser health and schema-drift diagnostics.
 *
 * Returns a real-time snapshot of:
 *  - Whether the alert threshold has been crossed in the current window.
 *  - Per-drift-type rejection counts in the sliding window.
 *  - A ring-buffer of recent rejection diagnostics (last 100 events).
 *
 * This endpoint is intentionally unauthenticated so it surfaces quickly in
 * incident dashboards and does not leak sensitive data (all fields are safe).
 */
@ApiTags("indexer")
@Controller("indexer")
export class ParserHealthController {
  constructor(
    private readonly schemaObservability: SchemaObservabilityService,
  ) {}

  @Get("parser-health")
  @ApiOperation({
    summary: "Parser schema-drift health status",
    description:
      "Returns real-time schema-drift diagnostics for the Soroban event parser. " +
      "Includes sliding-window rejection counts, alert state, and recent rejection details. " +
      "No sensitive data is exposed.",
  })
  @ApiResponse({
    status: 200,
    description: "Parser health snapshot",
    schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["healthy", "degraded"] },
        alertFiring: { type: "boolean" },
        windowMs: { type: "number", example: 60000 },
        alertThreshold: { type: "number", example: 10 },
        windowRejectionCount: { type: "number" },
        rejectionsByDriftType: {
          type: "object",
          additionalProperties: { type: "number" },
        },
        recentRejections: { type: "array", items: { type: "object" } },
      },
    },
  })
  getParserHealth(): ParserHealthSummary {
    return this.schemaObservability.getHealthSummary();
  }
}
