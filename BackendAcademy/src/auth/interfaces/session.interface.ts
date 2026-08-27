import { UserRole } from '../enums/user-role.enum';

/**
 * Represents a stored session record, persisted in a durable shared backend
 * (e.g., Redis  or a database) so sessions survive restarts
and are visible across all replicas.
 */

export interface Session {
  /** Unique session identifier (also stored inside the refresh token payload). */
  sessionId: string;

  /** Owner of the session. */
  userId: string;

  /** Role associated with the session. */
  role: UserRole;

  /** SHA-256 hash of the refresh token (never store raw token). */
  refreshTokenHash: string;

  /** When this session was first created. */
  createdAt: Date;

  /** When the refresh token expires. */
  expiresAt: Date;

  /** Absolute maximum lifetime of the session, independent of JWT exp. */
  absoluteExpiresAt?: Date;

  /** Timestamp after which the session is considered idle-expired if no activity. */
  idleExpiresAt?: Date;

  /** Grace period in seconds allowed for token delivery after expiry (clock skew buffer). */
  deliveryGraceSeconds?: number;

  /** Flag set to true once the session is revoked (logout / rotation). */
  revoked: boolean;

  /** Timestamp when the session was revoked. */
  revokedAt?: Date;

  /** SHA-256 hash of the device fingerprint (if device binding is enabled). */
  deviceHash?: string;

  /** Whether the device has been previously trusted by this user. */
  isTrustedDevice?: boolean;

  /** Timestamp of last user activity. */
  lastUsedAt?: Date;
}

export interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface RefreshTokenPayload {
  sub: string;
  role: UserRole;
  sessionId: string;
}
