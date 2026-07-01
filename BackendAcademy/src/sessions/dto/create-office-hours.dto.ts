import { IsString, IsDateString, IsNumber, IsOptional, MaxLength } from 'class-validator';

export class CreateOfficeHoursDto {
  @IsString()
  @MaxLength(200)
  tutorId: string;

  @IsString()
  @MaxLength(100)
  title: string;

  @IsString()
  @MaxLength(500)
  description: string;

  @IsDateString()
  startTime: string;

  @IsDateString()
  endTime: string;

  @IsNumber()
  @IsOptional()
  maxAttendees?: number;
}
