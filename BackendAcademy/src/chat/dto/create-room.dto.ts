import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateRoomDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsIn(['direct', 'room', 'course'])
  type: 'direct' | 'room' | 'course';

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  participants: string[];

  @IsOptional()
  @IsString()
  courseId?: string;
}
