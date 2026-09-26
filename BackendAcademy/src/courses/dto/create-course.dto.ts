import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateCourseDto {
  @ApiProperty({ example: 'ownership-101', description: 'Unique course identifier (slug-style)' })
  @IsString()
  @IsNotEmpty()
  courseId: string;

  @ApiProperty({ example: 'Ownership in Rust' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'Learn the ownership model that makes Rust memory-safe.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description: string;

  /**
   * courseIds that must be completed before a learner may enrol.
   * Omit or pass `[]` for a course with no prerequisites.
   */
  @ApiPropertyOptional({
    type: [String],
    example: ['intro-rust-101'],
    description: 'courseIds that must be completed before enrolling in this course',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @ArrayUnique()
  prerequisiteCourseIds?: string[];
}
