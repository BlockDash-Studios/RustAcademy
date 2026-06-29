import { IsString, IsNumber, IsOptional, IsArray, IsBoolean, IsEnum } from 'class-validator';
import { CourseLevel } from '../interfaces/course-level.enum';

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(CourseLevel)
  level?: CourseLevel;

  @IsOptional()
  @IsNumber()
  order?: number;

  @IsOptional()
  @IsString()
  learningPathId?: string;

  @IsOptional()
  @IsNumber()
  duration?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  prerequisites?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @IsOptional()
  @IsNumber()
  xpReward?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
