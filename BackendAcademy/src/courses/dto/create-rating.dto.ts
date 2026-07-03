import { IsNumber, IsOptional, IsString, Max, Min, Length } from 'class-validator';

/**
 * Request body for submitting or updating a course rating.
 */
export class CreateRatingDto {
  /**
   * Rating value from 1 to 5 (inclusive).
   */
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  /**
   * Optional review text, max 2000 characters.
   */
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  review?: string;
}
