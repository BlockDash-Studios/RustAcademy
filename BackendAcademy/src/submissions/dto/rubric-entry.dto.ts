import { IsString, IsNumber, IsOptional, Min } from 'class-validator';
import { RubricEntry } from '../interfaces/grading-result.interface';

/**
 * Validated shape of a single rubric criterion inside a grading payload.
 *
 * Declared as a class (not just the `RubricEntry` interface) so the global
 * `ValidationPipe` can validate each nested array element via
 * `@ValidateNested({ each: true })` + `@Type(() => RubricEntryDto)`.
 */
export class RubricEntryDto implements RubricEntry {
  @IsString()
  criterion: string;

  @IsNumber()
  @Min(0)
  points: number;

  @IsNumber()
  @Min(0)
  maxPoints: number;

  @IsOptional()
  @IsString()
  comment?: string;
}
