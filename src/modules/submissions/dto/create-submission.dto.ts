// src/modules/submissions/dto/create-submission.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateSubmissionDto {
    @IsString()
    @IsNotEmpty()
    taskId: string;

    @IsString()
    @IsNotEmpty()
    code: string;

    @IsString()
    @IsNotEmpty()
    languageVersion: string;
}