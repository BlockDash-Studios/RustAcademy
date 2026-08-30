import { IsString, IsIn, IsOptional } from 'class-validator';

export class CreateNotificationDto {
  @IsString()
  userId: string;

  @IsString()
  type: string;

  @IsString()
  title: string;

  @IsString()
  message: string;

  /**
   * Optional deterministic deduplication key.
   *
   * When provided, the notification service will reject duplicate
   * notifications that carry the same event key within the configured
   * deduplication window. This prevents retries and scheduled jobs from
   * sending duplicate reminders or alerts.
   */
  @IsOptional()
  @IsString()
  eventKey?: string;
}
