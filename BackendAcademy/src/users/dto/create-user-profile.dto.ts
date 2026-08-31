import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * BA-040 — Create profile DTO.
 *
 * Exposes ONLY client-editable fields. Role, verification status, and
 * internal ownership metadata (id, userId, createdAt, updatedAt) are
 * deliberately absent so they can never be mass-assigned by a caller.
 */
export class CreateUserProfileDto {
  @IsString()
  displayName: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  bio?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  githubUsername?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];
}
