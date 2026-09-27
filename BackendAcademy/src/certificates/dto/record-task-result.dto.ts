import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class RecordTaskResultDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  courseId: string;

  @IsString()
  @IsNotEmpty()
  taskId: string;

  @IsInt()
  @Min(0)
  @Max(100)
  score: number;
}
