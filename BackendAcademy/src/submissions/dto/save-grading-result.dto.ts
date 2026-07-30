import { IsString, IsNumber, IsOptional, IsArray, IsEnum, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { GradingResultStatus } from '../interfaces/grading-result-status.enum';
import { RubricEntryDto } from './rubric-entry.dto';

export class SaveGradingResultDto {
  @IsString()
  graderId: string;

  @IsEnum(GradingResultStatus)
  status: GradingResultStatus;

  @IsNumber()
  @Min(0)
  score: number;

  @IsNumber()
  @Min(0)
  maxScore: number;

  @IsString()
  feedback: string;

  @IsOptional()
  @IsString()
  privateNotes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RubricEntryDto)
  rubric?: RubricEntryDto[];
}
