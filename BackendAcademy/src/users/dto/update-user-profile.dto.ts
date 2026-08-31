import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * BA-040 — Update profile DTO.
 *
 * Only the fields a user may edit are exposed. Protected fields such as
 * `role`, `isVerified`, `verificationStatus`, `id`, `userId`, and audit
 * metadata are intentionally NOT part of this type, preventing mass
 * assignment / privilege escalation through the generic update endpoint.
 */
export class UpdateUserProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  displayName?: string;

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
