import { IsString, IsOptional, IsObject } from 'class-validator';

export class CheckSubmissionDto {
  @IsString()
  learnerId: string;

  @IsString()
  taskId: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
