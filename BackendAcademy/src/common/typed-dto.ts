/**
 * Typed DTO mappings for user and session data.
 *
 * #353: Replaces loosely typed maps with strongly typed DTOs
 * so downstream errors are caught at compile time rather than
 * at runtime during serialization or API responses.
 */

// ── User DTOs ────────────────────────────────────────────────────────────

export interface UserRecordDto {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly bio: string;
  readonly role: UserRole;
  readonly avatarUrl: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type UserRole = 'learner' | 'tutor' | 'admin';

export interface CreateUserDto {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role?: UserRole;
}

export interface UserPreferencesDto {
  readonly learnerPreferences?: Record<string, unknown>;
  readonly tutorPreferences?: Record<string, unknown>;
}

export interface UserProfileSnapshot {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string;
  readonly bio: string;
  readonly avatarUrl: string | null;
  readonly role: UserRole;
  readonly preferences: UserPreferencesDto;
  readonly lastUpdatedAt: Date;
}

// ── Session DTOs ─────────────────────────────────────────────────────────

export interface SessionRecordDto {
  readonly sessionId: string;
  readonly userId: string;
  readonly role: UserRole;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly deviceHash: string | null;
  readonly isTrustedDevice: boolean;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly revoked: boolean;
}

export interface SessionSummaryDto {
  readonly sessionId: string;
  readonly userId: string;
  readonly role: UserRole;
  readonly deviceHash: string | null;
  readonly isTrustedDevice: boolean;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

// ── Enrollment DTOs ──────────────────────────────────────────────────────

export interface EnrollmentRecordDto {
  readonly id: string;
  readonly userId: string;
  readonly courseId: string;
  readonly enrolledAt: Date;
  readonly status: EnrollmentStatus;
  readonly completedAt: Date | null;
  readonly progressPercent: number;
}

export type EnrollmentStatus = 'active' | 'completed' | 'dropped';

export interface CreateEnrollmentDto {
  readonly userId: string;
  readonly courseId: string;
}

// ── Onboarding DTOs ──────────────────────────────────────────────────────

export interface OnboardingCheckpointDto {
  readonly stepName: string;
  readonly completedAt: Date;
  readonly metadata?: Record<string, unknown>;
}

export interface OnboardingProgressSnapshot {
  readonly id: string;
  readonly userId: string;
  readonly currentStep: string;
  readonly completedSteps: string[];
  readonly checkpoints: OnboardingCheckpointDto[];
  readonly totalSteps: number;
  readonly isComplete: boolean;
  readonly completionPercent: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ── Analytics DTOs ───────────────────────────────────────────────────────

export interface AnalyticsEventDto {
  readonly id: string;
  readonly userId: string | null;
  readonly eventType: string;
  readonly properties: Record<string, unknown>;
  readonly timestamp: Date;
  readonly sessionId?: string;
}

// ── Mapping helpers ──────────────────────────────────────────────────────

/**
 * Maps a raw user record (from storage) to a UserRecordDto.
 * Ensures all fields are present and correctly typed.
 */
export function toUserRecordDto(raw: Record<string, unknown>): UserRecordDto {
  return {
    id: String(raw.id),
    email: String(raw.email),
    displayName: String(raw.displayName ?? raw.display_name ?? ''),
    bio: String(raw.bio ?? ''),
    role: (raw.role as UserRole) ?? 'learner',
    avatarUrl: raw.avatarUrl != null ? String(raw.avatarUrl) : null,
    createdAt: raw.createdAt instanceof Date ? raw.createdAt : new Date(String(raw.createdAt)),
    updatedAt: raw.updatedAt instanceof Date ? raw.updatedAt : new Date(String(raw.updatedAt)),
  };
}

/**
 * Maps a raw session record to a SessionSummaryDto (without secrets).
 */
export function toSessionSummaryDto(raw: Record<string, unknown>): SessionSummaryDto {
  return {
    sessionId: String(raw.sessionId ?? raw.session_id),
    userId: String(raw.userId ?? raw.user_id),
    role: (raw.role as UserRole) ?? 'learner',
    deviceHash: raw.deviceHash != null ? String(raw.deviceHash) : null,
    isTrustedDevice: Boolean(raw.isTrustedDevice),
    createdAt: raw.createdAt instanceof Date ? raw.createdAt : new Date(String(raw.createdAt)),
    expiresAt: raw.expiresAt instanceof Date ? raw.expiresAt : new Date(String(raw.expiresAt)),
  };
}

/**
 * Maps a raw enrollment record to an EnrollmentRecordDto.
 */
export function toEnrollmentRecordDto(raw: Record<string, unknown>): EnrollmentRecordDto {
  return {
    id: String(raw.id),
    userId: String(raw.userId ?? raw.user_id),
    courseId: String(raw.courseId ?? raw.course_id),
    enrolledAt: raw.enrolledAt instanceof Date ? raw.enrolledAt : new Date(String(raw.enrolledAt)),
    status: (raw.status as EnrollmentStatus) ?? 'active',
    completedAt: raw.completedAt instanceof Date ? raw.completedAt : raw.completedAt ? new Date(String(raw.completedAt)) : null,
    progressPercent: Number(raw.progressPercent ?? 0),
  };
}

/**
 * Maps raw onboarding data to a progress snapshot with checkpoints.
 */
export function toOnboardingProgressSnapshot(raw: Record<string, unknown>): OnboardingProgressSnapshot {
  const completedSteps = Array.isArray(raw.completedSteps) ? raw.completedSteps as string[] : [];
  const totalSteps = Number(raw.totalSteps ?? 0);
  const checkpoints: OnboardingCheckpointDto[] = Array.isArray(raw.checkpoints)
    ? (raw.checkpoints as Record<string, unknown>[]).map((c) => ({
        stepName: String(c.stepName),
        completedAt: c.completedAt instanceof Date ? c.completedAt : new Date(String(c.completedAt)),
        metadata: (c.metadata as Record<string, unknown>) ?? {},
      }))
    : [];

  return {
    id: String(raw.id),
    userId: String(raw.userId),
    currentStep: String(raw.currentStep ?? ''),
    completedSteps,
    checkpoints,
    totalSteps,
    isComplete: Boolean(raw.isComplete),
    completionPercent: totalSteps > 0 ? Math.round((completedSteps.length / totalSteps) * 100) : 0,
    createdAt: raw.createdAt instanceof Date ? raw.createdAt : new Date(String(raw.createdAt)),
    updatedAt: raw.updatedAt instanceof Date ? raw.updatedAt : new Date(String(raw.updatedAt)),
  };
}
