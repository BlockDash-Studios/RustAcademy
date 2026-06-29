import { IsString, IsNumber, IsOptional, IsArray, IsEnum, Min, Max } from 'class-validator';
import { GradingResultStatus } from '../interfaces/grading-result-status.enum';
import { RubricEntry } from '../interfaces/grading-result.interface';

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
  rubric?: RubricEntry[];
}
