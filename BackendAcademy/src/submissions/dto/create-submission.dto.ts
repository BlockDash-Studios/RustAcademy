import { IsString, IsOptional } from 'class-validator';

export class CreateSubmissionDto {
  @IsString()
  taskId: string;

  @IsString()
  userId: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;
}
