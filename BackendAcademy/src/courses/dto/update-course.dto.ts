import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CourseLevel } from '../interfaces/course-level.enum';
import {
  COURSE_DESCRIPTION_MAX_LENGTH,
  COURSE_TAXONOMY_ITEM_MAX_LENGTH,
  COURSE_TAXONOMY_MAX_ITEMS,
  COURSE_TITLE_MAX_LENGTH,
  COURSE_TITLE_MIN_LENGTH,
} from './create-course.dto';

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(COURSE_TITLE_MIN_LENGTH)
  @MaxLength(COURSE_TITLE_MAX_LENGTH)
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(COURSE_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @IsOptional()
  @IsEnum(CourseLevel)
  level?: CourseLevel;

  @IsOptional()
  @IsNumber()
  order?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  learningPathId?: string;

  @IsOptional()
  @IsNumber()
  duration?: number;

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

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  changeNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  revisionAuthor?: string;
}