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
  absoluteExpiresAt: Date;
  idleExpiresAt: Date;
  deliveryGraceSeconds: number;
  lastActivityAt: Date;
  revoked: boolean;
  revokedAt?: Date;
  deviceHash?: string;
  isTrustedDevice?: boolean;
}
