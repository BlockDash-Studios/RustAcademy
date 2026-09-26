import { ArrayUnique, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateCourseDto {
  @IsString() @IsNotEmpty() courseId: string;
  @IsString() @IsNotEmpty() title: string;
  @IsInt() @Min(1) capacity: number;
  @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) prerequisiteIds?: string[];
}

export class LearnerDto {
  @IsString() @IsNotEmpty() userId: string;
}

export class CreateTaskDto {
  @IsString() @IsNotEmpty() taskId: string;
}

export class SubmitTaskDto extends LearnerDto {
  @IsString() @IsNotEmpty() submissionId: string;
}
