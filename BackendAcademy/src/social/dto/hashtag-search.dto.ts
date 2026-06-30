import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query parameters for hashtag search and discovery endpoints.
 */
export class HashtagSearchDto {
  /**
   * Partial tag name to search for (without the leading '#').
   * When omitted the endpoint returns all known hashtags.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  query?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Min(1)
  limit?: number = 20;
}
