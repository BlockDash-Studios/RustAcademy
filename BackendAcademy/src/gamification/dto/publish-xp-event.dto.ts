import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString, IsISO8601 } from 'class-validator';
import { XpEventType } from '../xp.types';

export class PublishXpEventDto {
  @IsString()
  @IsNotEmpty()
  eventId: string;

  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsIn(['task.passed', 'course.completed', 'streak.day', 'contribution.created'])
  type: XpEventType;

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
