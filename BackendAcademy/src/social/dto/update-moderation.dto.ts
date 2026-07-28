import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ModerationStatus, MODERATION_STATUSES } from '../interfaces/social-post.interface';

export class UpdateModerationDto {
  @IsIn(MODERATION_STATUSES as unknown as string[])
  @IsNotEmpty()
  status: ModerationStatus;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}
