import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Maximum character length applied to all free-text string preference fields.
 * This prevents oversized payloads from being stored in preference records.
 */
const STRING_MAX_LENGTH = 200;

/**
 * Allow-listed values for the `theme` preference.
 * Extending the UI theme options must be done here and in the frontend.
 */
const ALLOWED_THEMES = ['light', 'dark', 'system'] as const;
export type ThemeValue = (typeof ALLOWED_THEMES)[number];

/**
 * Learner-specific user preferences.
 *
 * All fields are optional so a PATCH-style partial update is supported.
 * Only explicitly listed keys are accepted — the global ValidationPipe
 * (`forbidNonWhitelisted: true`) will reject any unknown keys with 400.
 *
 * Allowed keys and their constraints:
 * - `theme`              — UI colour scheme; must be one of the allow-listed values
 * - `email_alerts`       — opt-in/out of email notification delivery
 * - `push_notifications` — opt-in/out of push notification delivery
 * - `marketing_updates`  — opt-in/out of marketing communication
 * - `displayName`        — public display name; max 200 chars
 * - `email`              — contact email address; validated as RFC 5322 address
 * - `avatarUrl`          — URL of the user's avatar image; validated as URL
 */
export class LearnerPreferencesDto {
  @IsOptional()
  @IsIn(ALLOWED_THEMES)
  theme?: ThemeValue;

  @IsOptional()
  @IsBoolean()
  email_alerts?: boolean;

  @IsOptional()
  @IsBoolean()
  push_notifications?: boolean;

  @IsOptional()
  @IsBoolean()
  marketing_updates?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(STRING_MAX_LENGTH)
  displayName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;
}

/**
 * Allow-listed values for the tutor `availability` preference.
 * Using an enum-like string union keeps the stored value normalised.
 */
const ALLOWED_AVAILABILITY = ['weekdays', 'weekends', 'both', 'none'] as const;
export type AvailabilityValue = (typeof ALLOWED_AVAILABILITY)[number];

/**
 * Tutor-specific user preferences.
 *
 * All fields are optional so a PATCH-style partial update is supported.
 * Only explicitly listed keys are accepted.
 *
 * Allowed keys and their constraints:
 * - `availability`      — teaching availability windows; must be one of the allow-listed values
 * - `sessionLanguage`   — preferred language for sessions; max 200 chars
 */
export class TutorPreferencesDto {
  @IsOptional()
  @IsIn(ALLOWED_AVAILABILITY)
  availability?: AvailabilityValue;

  @IsOptional()
  @IsString()
  @MaxLength(STRING_MAX_LENGTH)
  sessionLanguage?: string;
}

/**
 * Request body for PUT /users/:userId/preferences.
 *
 * Replaces the former `Record<string, unknown>` interface which allowed
 * arbitrary keys, invalid value types, and oversized payloads to be stored.
 * Validation is enforced by the global ValidationPipe
 * (whitelist + forbidNonWhitelisted + forbidUnknownValues).
 */
export class UpdateUserPreferencesDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => LearnerPreferencesDto)
  learnerPreferences?: LearnerPreferencesDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TutorPreferencesDto)
  tutorPreferences?: TutorPreferencesDto;
}
