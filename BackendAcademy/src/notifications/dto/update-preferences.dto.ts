import { IsOptional, IsBoolean } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  email_alerts?: boolean;

  @IsOptional()
  @IsBoolean()
  push_notifications?: boolean;

  @IsOptional()
  @IsBoolean()
  marketing_updates?: boolean;

  /** Issue #360: Receive alerts on permanent grading failures */
  @IsOptional()
  @IsBoolean()
  grading_failure_alerts?: boolean;

  /** Issue #362: Receive alerts on new badge earnings */
  @IsOptional()
  @IsBoolean()
  badge_earned_alerts?: boolean;
}
