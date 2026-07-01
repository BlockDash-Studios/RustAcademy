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

  /**
   * NOTE: The `isVerified` flag and the `status` field are intentionally NOT
   * exposed through this generic update DTO. Verification status must be
   * mutated through the dedicated `/tutors/:id/verify` and
   * `/tutors/:id/unverify` endpoints, which emit audit metadata
   * (verifiedAt, verifiedBy, verificationNote) and live behind RBAC.
   */
}
