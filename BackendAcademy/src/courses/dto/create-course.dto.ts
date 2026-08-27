import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CourseLevel } from '../interfaces/course-level.enum';

/** Shared bounds for canonical course taxonomy (see BA-047). */
export const COURSE_TITLE_MIN_LENGTH = 3;
export const COURSE_TITLE_MAX_LENGTH = 120;
export const COURSE_DESCRIPTION_MAX_LENGTH = 4000;
export const COURSE_TAXONOMY_ITEM_MAX_LENGTH = 60;
export const COURSE_TAXONOMY_MAX_ITEMS = 20;

export class CreateCourseDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(COURSE_TITLE_MIN_LENGTH)
  @MaxLength(COURSE_TITLE_MAX_LENGTH)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(COURSE_DESCRIPTION_MAX_LENGTH)
  description: string;

  @IsEnum(CourseLevel)
  level: CourseLevel;

  @IsNumber()
  order: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  learningPathId: string;

  @IsNumber()
  duration: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(COURSE_TAXONOMY_ITEM_MAX_LENGTH)
  category?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(COURSE_TAXONOMY_MAX_ITEMS)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(COURSE_TAXONOMY_ITEM_MAX_LENGTH, { each: true })
  categories?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(COURSE_TAXONOMY_MAX_ITEMS)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(COURSE_TAXONOMY_ITEM_MAX_LENGTH, { each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(COURSE_TAXONOMY_MAX_ITEMS)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(COURSE_TAXONOMY_ITEM_MAX_LENGTH, { each: true })
  prerequisites?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(COURSE_TAXONOMY_MAX_ITEMS)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(COURSE_TAXONOMY_ITEM_MAX_LENGTH, { each: true })
  skills?: string[];

  @IsOptional()
  @IsNumber()
  xpReward?: number;
}