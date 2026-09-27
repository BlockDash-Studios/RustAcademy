import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateLessonDto {
  @ApiProperty({ example: 'ownership-101-lesson-1' })
  @IsString()
  @IsNotEmpty()
  lessonId: string;

  @ApiProperty({ example: 'ownership-101', description: 'The course this lesson belongs to' })
  @IsString()
  @IsNotEmpty()
  courseId: string;

  @ApiProperty({ example: 'What is ownership?' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 1, description: 'Position of this lesson within the course (1-based)' })
  @IsInt()
  @Min(1)
  order: number;

  /**
   * lessonIds (within the same course) that must be completed before starting
   * this lesson. Omit or pass `[]` for a lesson with no prerequisites.
   */
  @ApiPropertyOptional({
    type: [String],
    example: ['ownership-101-lesson-1'],
    description: 'lessonIds that must be completed before starting this lesson',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @ArrayUnique()
  prerequisiteLessonIds?: string[];
}
