import { ArrayUnique, IsArray, IsNotEmpty, IsString } from 'class-validator';

export class RegisterCourseDto {
  @IsString()
  @IsNotEmpty()
  courseId: string;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  lessonIds: string[];

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  taskIds: string[];
}
