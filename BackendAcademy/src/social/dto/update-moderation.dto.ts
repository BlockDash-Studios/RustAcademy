import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ModerationStatus } from '../interfaces/social-post.interface';

export class UpdateModerationDto {
  @IsEnum(['pending', 'approved', 'rejected', 'flagged'] as const)
  @IsNotEmpty()
  status: ModerationStatus;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}
