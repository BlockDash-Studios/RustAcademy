import { IsNotEmpty, IsString } from 'class-validator';

export class CompleteLessonDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  courseId: string;

  @IsString()
  @IsNotEmpty()
  lessonId: string;
}
