import { UserRole } from '../enums/user-role.enum';

/**
 * Represents a stored session record, persisted in the in-memory store
 * (or a future Redis / database layer).
 */
export interface Session {
  /** Unique session identifier (also stored inside the refresh token payload). */
  sessionId: string;

  /** Owner of the session. */
  userId: string;

  /** Role associated with the session. */
  role: UserRole;

  /** Opaque refresh token value that can be exchanged for a new access token. */
  refreshToken: string;

  /** When this session was first created. */
  createdAt: Date;

  /** When the refresh token expires. */
  expiresAt: Date;

  /** Flag set to true once the session is revoked (logout / rotation). */
  revoked: boolean;
}

/**
 * Payload embedded in a signed refresh JWT.
 */
export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

/**
 * Returned to the caller after a successful login or token refresh.
 */
export interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  /** Access token TTL in seconds. */
  expiresIn: number;
}
