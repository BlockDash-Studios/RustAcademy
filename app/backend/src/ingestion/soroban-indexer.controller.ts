import {
  Body,
  Controller,
  ConflictException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from "class-validator";

import { SorobanEventIndexerService, LedgerRangeResult } from "./soroban-event-indexer.service";
import { ContractEventDriftService } from "./contract-event-drift.service";
import { ParserHealthResponseDto } from "./parser-health.dto";

class ReindexDto {
  @IsString()
  @IsNotEmpty()
  contractId!: string;

  @IsInt()
  @Min(1)
  fromLedger!: number;

  @IsInt()
  @Min(1)
  toLedger!: number;

  /**
   * When true, ignores the stored checkpoint and re-processes the full range.
   * Idempotent upserts ensure no duplicate records are created.
   */
  @IsBoolean()
  @IsOptional()
  force?: boolean;
}

/**
 * Developer-facing endpoints for Soroban indexer administration and parser health.
 * Should be protected by an API-key guard in production.
 */
@ApiTags("indexer")
@Controller("indexer")
export class SorobanIndexerController {
  private running = false;

  constructor(
    private readonly indexer: SorobanEventIndexerService,
    private readonly driftService: ContractEventDriftService,
  ) {}

  @Post("reindex")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Reindex Soroban contract events for a ledger range (admin only)",
    description:
      "Fetches and persists all contract events in [fromLedger, toLedger]. " +
      "Safe to call multiple times — idempotent upserts prevent duplicates. " +
      "Set force=true to ignore the stored checkpoint and reprocess the full range.",
  })
  @ApiResponse({ status: 200, description: "Reindex completed" })
  @ApiResponse({ status: 409, description: "A reindex run is already in progress" })
  async reindex(@Body() dto: ReindexDto): Promise<LedgerRangeResult> {
    if (this.running) {
      throw new ConflictException("A reindex run is already in progress");
    }

    this.running = true;
    try {
      return await this.indexer.indexLedgerRange(
        dto.contractId,
        dto.fromLedger,
        dto.toLedger,
        undefined,
        dto.force ?? false,
      );
    } finally {
      this.running = false;
    }
  }

  /**
   * Developer-facing endpoint that exposes the parser health snapshot.
   *
   * Includes:
   * - Rolling 5-minute window rejection rate and breakdown by reason
   * - Cumulative totals since service start
   * - Known event names from the schema registry
   * - Max / current schema versions
   * - Recent drift events (field names only — no raw payload values)
   *
   * This endpoint is intentionally unauthenticated for observability dashboards.
   * It contains no sensitive data — only schema metadata and aggregate counters.
   */
  @Get("parser-health")
  @ApiOperation({
    summary: "Parser health and schema drift status",
    description:
      "Returns aggregate parser counters, rolling rejection rate, schema version info, " +
      "and recent drift events (field names only, no raw payload values). " +
      "Use this endpoint to surface schema mismatches in monitoring dashboards.",
  })
  @ApiResponse({
    status: 200,
    type: ParserHealthResponseDto,
    description: "Parser health snapshot retrieved successfully",
  })
  getParserHealth(): ParserHealthResponseDto {
    return this.driftService.getHealthSnapshot();
  }
}
