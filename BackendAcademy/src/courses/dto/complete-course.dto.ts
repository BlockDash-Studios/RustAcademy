import { IsString, IsNotEmpty } from 'class-validator';

export class CompleteCourseDto {
  @IsString()
  @IsNotEmpty()
  userId: string;
}
