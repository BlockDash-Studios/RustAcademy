// src/modules/learning-paths/dto/create-learning-path.dto.ts
import { IsString, IsNotEmpty, IsEnum, IsArray, IsOptional, IsInt, Min } from 'class-validator';

export enum LearningPathLevel {
    BEGINNER = 'Rusty Rookie',
    INTERMEDIATE = 'Crab Coder',
    ADVANCED = 'Ferris Pro',
    WEB3 = 'Soroban Sage',
}

export class CreateLearningPathDto {
    @IsEnum(LearningPathLevel)
    @IsNotEmpty()
    title: LearningPathLevel;

    @IsString()
    @IsNotEmpty()
    description: string;

    @IsInt()
    @Min(0)
    orderIndex: number;

    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    courseIds?: string[];
}