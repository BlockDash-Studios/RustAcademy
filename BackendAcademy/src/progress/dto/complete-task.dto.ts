import { IsNotEmpty, IsString } from 'class-validator';

export class CompleteTaskDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  courseId: string;

  @IsString()
  @IsNotEmpty()
  taskId: string;
}
