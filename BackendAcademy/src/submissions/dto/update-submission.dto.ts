import { IsString, IsOptional, IsNumber, IsEnum } from 'class-validator';
import { SubmissionStatus } from '../interfaces/submission-status.enum';

export class UpdateSubmissionDto {
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsEnum(SubmissionStatus)
  status?: SubmissionStatus;

  @IsOptional()
  @IsString()
  feedback?: string;

  @IsOptional()
  @IsNumber()
  score?: number;

  @IsOptional()
  @IsString()
  reviewedBy?: string;
}
