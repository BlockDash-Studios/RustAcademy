import { IsString, IsOptional, IsArray, IsNumber, IsBoolean, IsEnum } from 'class-validator';
import { TutorSpecialty } from '../interfaces/tutor-specialty.enum';

export class UpdateTutorProfileDto {
  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(TutorSpecialty, { each: true })
  specialties?: TutorSpecialty[];

  @IsOptional()
  @IsNumber()
  hourlyRate?: number;

  @IsOptional()
  @IsBoolean()
  availability?: boolean;

  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;
}
