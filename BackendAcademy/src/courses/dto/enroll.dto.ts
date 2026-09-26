import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class EnrollDto {
  @ApiProperty({ example: 'user-abc-123' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ example: 'lifetimes-201' })
  @IsString()
  @IsNotEmpty()
  courseId: string;
}
