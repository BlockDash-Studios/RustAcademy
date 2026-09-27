// src/modules/lessons/dto/create-lesson.dto.ts
import { IsString, IsNotEmpty, IsInt, Min, IsOptional, IsArray } from 'class-validator';

export class CreateLessonDto {
    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsNotEmpty()
    contentMarkdown: string;

    @IsInt()
    @Min(0)
    orderIndex: number;

    @IsInt()
    @Min(1)
    durationMinutes: number;

    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    codeBlockAttachments?: string[];
}