import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from "class-validator";

export class DailySummaryQueryDto {
  @ApiProperty({
    description:
      "Stellar public key for the user whose daily activity summary should be returned",
    example: "GBXGQ55JMQ4L2B6E7S8Y9Z0A1B2C3D4E5F6G7H8I7YWR",
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/, { message: "Invalid Stellar public key format" })
  publicKey: string;

  @ApiPropertyOptional({
    description: "Start date (inclusive) in ISO-8601 format",
    example: "2026-06-01T00:00:00.000Z",
  })
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @ApiPropertyOptional({
    description: "End date (inclusive) in ISO-8601 format",
    example: "2026-06-29T23:59:59.999Z",
  })
  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @ApiPropertyOptional({
    description:
      "Whether to include zero-activity days in the returned daily summary list",
    default: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined) {
      return true;
    }

    if (typeof value === "boolean") {
      return value;
    }

    return value === "true";
  })
  @IsBoolean()
  includeEmptyDays: boolean = true;
}
