// src/modules/courses/dto/create-course.dto.ts
import { IsString, IsNotEmpty, IsEnum, IsArray, IsOptional, IsNumber, Min } from 'class-validator';

export enum CourseLevel {
    BEGINNER = 'BEGINNER',
    INTERMEDIATE = 'INTERMEDIATE',
    ADVANCED = 'ADVANCED',
}

export class CreateCourseDto {
    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsNotEmpty()
    description: string;

    @IsEnum(CourseLevel)
    level: CourseLevel;

    @IsArray()
    @IsString({ each: true })
    tags: string[];

    @IsNumber()
    @Min(0)
    @IsOptional()
    price?: number;
}