import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class RecordLessonCompletionDto {
  @IsString()
  lessonId: string;

  /**
   * XP earned for this completion. Defaults to 0 if not provided.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  xpEarned?: number;
}

export class RecordTaskCompletionDto {
  @IsString()
  taskId: string;

  /**
   * XP earned for this completion. Defaults to 0 if not provided.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  xpEarned?: number;
}
