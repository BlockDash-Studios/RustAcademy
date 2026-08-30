import { IsInt, IsOptional, IsPositive, Min, Max, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

/** BA-119: Maximum feed page size to prevent resource exhaustion. */
const MAX_FEED_PAGE_SIZE = 100;

export class GetSocialFeedDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Min(1)
  @Max(MAX_FEED_PAGE_SIZE)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  tag?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
