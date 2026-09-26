import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CompleteLessonDto {
  @ApiProperty({ example: 'user-abc-123' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ example: 'ownership-101-lesson-1' })
  @IsString()
  @IsNotEmpty()
  lessonId: string;
}
