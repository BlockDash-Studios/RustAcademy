import { UserRole } from '../enums/user-role.enum';

export interface RefreshTokenPayload {
  sub: string;
  role: UserRole;
  sessionId: string;
  type: 'refresh';
}

export interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface Session {
  sessionId: string;
  userId: string;
  role: UserRole;
  refreshTokenHash: string;
  createdAt: Date;
  expiresAt: Date;

  /** Absolute maximum lifetime of the session, independent of JWT exp. */
  absoluteExpiresAt?: Date;

  /** Timestamp after which the session is considered idle-expired if no activity. */
  idleExpiresAt?: Date;

  /** Grace period in seconds allowed for token delivery after expiry (clock skew buffer). */
  deliveryGraceSeconds?: number;

  lastActivityAt: Date;

  /** Flag set to true once the session is revoked (logout / rotation). */
  revoked: boolean;
  revokedAt?: Date;
  deviceHash?: string;
  isTrustedDevice?: boolean;

  /** Timestamp of last user activity. */
  lastUsedAt?: Date;
}