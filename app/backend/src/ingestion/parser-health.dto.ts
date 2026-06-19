import { ApiProperty } from "@nestjs/swagger";

export class ParserWindowStatsDto {
  @ApiProperty({ description: "Events successfully parsed in the last 5 minutes" })
  processed!: number;

  @ApiProperty({ description: "Events rejected in the last 5 minutes" })
  rejected!: number;

  @ApiProperty({
    description:
      "Rejection rate as a percentage (0–100, two decimal places) for the last 5 minutes",
    example: 2.34,
  })
  rejectionRate!: number;

  @ApiProperty({ description: "Events with an unrecognised event name in the last 5 minutes" })
  unknownEventNames!: number;

  @ApiProperty({ description: "Events with missing payload fields in the last 5 minutes" })
  fieldMismatches!: number;

  @ApiProperty({ description: "Events that caused an XDR parse error in the last 5 minutes" })
  parseErrors!: number;

  @ApiProperty({
    description: "Events with schema_version > maxSupportedSchemaVersion in the last 5 minutes",
  })
  schemaVersionTooHigh!: number;

  @ApiProperty({
    description: "Events with schema_version not in the compatible versions list in the last 5 minutes",
  })
  incompatibleSchemaVersion!: number;

  @ApiProperty({ description: "Events whose on-chain topic didn't match the expected topic in the last 5 minutes" })
  topicMismatches!: number;
}

export class ParserTotalsDto {
  @ApiProperty({ description: "Total events successfully parsed since service start" })
  processed!: number;

  @ApiProperty({ description: "Total events rejected since service start" })
  rejected!: number;

  @ApiProperty({ description: "Total unknown event names since service start" })
  unknownEventNames!: number;

  @ApiProperty({ description: "Total field mismatches since service start" })
  fieldMismatches!: number;

  @ApiProperty({ description: "Total parse errors since service start" })
  parseErrors!: number;

  @ApiProperty({ description: "Total schema_version_too_high rejections since service start" })
  schemaVersionTooHigh!: number;

  @ApiProperty({ description: "Total incompatible_schema_version rejections since service start" })
  incompatibleSchemaVersion!: number;

  @ApiProperty({ description: "Total topic mismatches since service start" })
  topicMismatches!: number;
}

export class DriftEventDto {
  @ApiProperty({
    enum: [
      "unknown_event_name",
      "schema_version_too_high",
      "incompatible_schema_version",
      "field_mismatch",
      "topic_mismatch",
      "parse_error",
    ],
  })
  reason!: string;

  @ApiProperty({ example: "CXXX..." })
  contractId!: string;

  @ApiProperty({ example: "EscrowDeposited" })
  eventName!: string;

  @ApiProperty({ example: 3 })
  schemaVersion!: number;

  @ApiProperty({ example: "12345-1" })
  pagingToken!: string;

  @ApiProperty({ type: [String], required: false, example: ["amount", "token"] })
  observedFields?: string[];

  @ApiProperty({ type: [String], required: false })
  expectedFields?: string[];

  @ApiProperty({ type: [String], required: false, example: ["expires_at"] })
  missingFields?: string[];

  @ApiProperty({ type: [String], required: false, example: ["new_field"] })
  extraFields?: string[];

  @ApiProperty({ example: "2024-01-01T00:00:00.000Z" })
  detectedAt!: string;
}

export class ParserHealthResponseDto {
  @ApiProperty({ type: ParserWindowStatsDto, description: "Rolling 5-minute window stats" })
  window!: ParserWindowStatsDto;

  @ApiProperty({ type: ParserTotalsDto, description: "Cumulative totals since service start" })
  totals!: ParserTotalsDto;

  @ApiProperty({ type: [String], description: "Event names known to the schema registry" })
  knownEventNames!: string[];

  @ApiProperty({ example: 2, description: "Maximum schema_version this indexer can parse" })
  maxSupportedSchemaVersion!: number;

  @ApiProperty({ example: 2, description: "Canonical schema_version declared in event-schema.ts" })
  currentSchemaVersion!: number;

  @ApiProperty({
    type: [DriftEventDto],
    description: "Most recent schema drift events (up to 20). Contains only field names, never raw payload values.",
  })
  recentDriftEvents!: DriftEventDto[];

  @ApiProperty({ example: "2024-01-01T00:00:00.000Z" })
  snapshotAt!: string;
}
