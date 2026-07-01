import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { UserRole } from './enums/user-role.enum';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import {
  AuthTokensResponse,
  RefreshTokenPayload,
  Session,
} from './interfaces/session.interface';

/**
 * AuthSessionService — Issue #220
 *
 * Provides secure session management with:
 *  - Short-lived access tokens (JWT, default 15 min)
 *  - Long-lived refresh tokens (JWT, default 7 days)
 *  - Refresh-token rotation: every refresh revokes the old token and
 *    issues a fresh pair, preventing replay attacks.
 *  - Session revocation on logout (single session) or logout-all (all
 *    sessions belonging to a user).
 *
 * Sessions are stored in memory for now; the Map can be swapped for a
 * Redis store without changing the public API.
 */
@Injectable()
export class AuthSessionService {
  /** In-memory session store: sessionId → Session */
  private readonly sessions = new Map<string, Session>();

  /** How long the access token is valid (seconds). */
  private readonly accessTokenTtl: number;

  /** How long the refresh token is valid (seconds). */
  private readonly refreshTokenTtl: number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.accessTokenTtl = this.configService.get<number>(
      'JWT_ACCESS_EXPIRES_IN',
      900, // 15 minutes
    );
    this.refreshTokenTtl = this.configService.get<number>(
      'JWT_REFRESH_EXPIRES_IN',
      604_800, // 7 days
    );
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Creates a new session for the given user.
   * Called by the login endpoint after credentials have been verified.
   */
  async createSession(
    userId: string,
    role: UserRole,
  ): Promise<AuthTokensResponse> {
    const sessionId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.refreshTokenTtl * 1000);

    const { accessToken, refreshToken } = await this.signTokenPair(
      userId,
      role,
      sessionId,
    );

    const session: Session = {
      sessionId,
      userId,
      role,
      refreshToken,
      createdAt: now,
      expiresAt,
      revoked: false,
    };

    this.sessions.set(sessionId, session);

    return this.buildTokensResponse(accessToken, refreshToken);
  }

  /**
   * Rotates a refresh token:
   *  1. Validates and decodes the incoming refresh JWT.
   *  2. Verifies the session exists and is not revoked / expired.
   *  3. Revokes the old session record.
   *  4. Issues a fresh token pair under a new sessionId.
   */
  async refreshTokens(rawRefreshToken: string): Promise<AuthTokensResponse> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        rawRefreshToken,
        { secret: this.refreshSecret },
      );
    } catch {
      throw new UnauthorizedException({
        error: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid or has expired',
      });
    }

    const session = this.sessions.get(payload.sessionId);
    if (!session || session.revoked) {
      throw new UnauthorizedException({
        error: 'SESSION_NOT_FOUND',
        message: 'Session has been revoked or does not exist',
      });
    }

    if (session.refreshToken !== rawRefreshToken) {
      // Token reuse detected — revoke the whole session as a security measure.
      session.revoked = true;
      this.sessions.set(session.sessionId, session);
      throw new UnauthorizedException({
        error: 'TOKEN_REUSE_DETECTED',
        message: 'Refresh token has already been used; session revoked',
      });
    }

    if (new Date() > session.expiresAt) {
      session.revoked = true;
      this.sessions.set(session.sessionId, session);
      throw new UnauthorizedException({
        error: 'SESSION_EXPIRED',
        message: 'Session has expired; please log in again',
      });
    }

    // Revoke the old session before issuing new tokens (rotation).
    session.revoked = true;
    this.sessions.set(session.sessionId, session);

    return this.createSession(session.userId, session.role);
  }

  /**
   * Revokes a single session (logout from current device).
   */
  revokeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.revoked = true;
      this.sessions.set(sessionId, session);
    }
  }

  /**
   * Revokes all active sessions for a user (logout from all devices).
   */
  revokeAllUserSessions(userId: string): void {
    for (const [, session] of this.sessions) {
      if (session.userId === userId) {
        session.revoked = true;
        this.sessions.set(session.sessionId, session);
      }
    }
  }

  /**
   * Returns all active (non-revoked, non-expired) sessions for a user.
   */
  getActiveSessions(userId: string): Omit<Session, 'refreshToken'>[] {
    const now = new Date();
    return Array.from(this.sessions.values())
      .filter(
        (s) => s.userId === userId && !s.revoked && s.expiresAt > now,
      )
      .map(({ refreshToken: _rt, ...rest }) => rest);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async signTokenPair(
    userId: string,
    role: UserRole,
    sessionId: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessPayload: JwtPayload = { sub: userId, role };
    const refreshPayload: RefreshTokenPayload = { sub: userId, role, sessionId };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        expiresIn: this.accessTokenTtl,
        // Access token uses the default JWT_SECRET set in JwtModule.
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.refreshSecret,
        expiresIn: this.refreshTokenTtl,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private buildTokensResponse(
    accessToken: string,
    refreshToken: string,
  ): AuthTokensResponse {
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTokenTtl,
    };
  }

  /**
   * Separate secret for refresh tokens so a leaked access secret cannot
   * be used to forge refresh tokens (and vice-versa).
   */
  private get refreshSecret(): string {
    return this.configService.get<string>(
      'JWT_REFRESH_SECRET',
      this.configService.get<string>('JWT_SECRET', 'changeme-refresh'),
    );
  }
}
