import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CompleteCourseDto {
  @ApiProperty({ example: 'user-abc-123' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ example: 'ownership-101' })
  @IsString()
  @IsNotEmpty()
  courseId: string;
}
