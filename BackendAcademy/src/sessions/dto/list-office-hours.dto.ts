import { IsOptional, IsDateString, IsString } from 'class-validator';

export class ListOfficeHoursDto {
  @IsOptional()
  @IsString()
  tutorId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
