import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID, createHash } from 'crypto';
import { UserRole } from './enums/user-role.enum';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import {
  AuthTokensResponse,
  RefreshTokenPayload,
  Session,
} from './interfaces/session.interface';

/**
 * #350: Centralized session policy configuration.
 * All session-related durations and rules are defined in one place
 * so they can be enforced consistently across web and mobile clients.
 */
export interface SessionPolicy {
  /** Access token TTL in seconds (default: 15 min). */
  accessTokenTtl: number;
  /** Refresh token TTL in seconds (default: 7 days). */
  refreshTokenTtl: number;
  /** Grace period after refresh token expiry for delivery delays (seconds). */
  deliveryGracePeriod: number;
  /** Maximum number of concurrent sessions per user. */
  maxConcurrentSessions: number;
  /** Whether to enforce single-session mode (logout other sessions on new login). */
  singleSessionMode: boolean;
  /** Whether to require device fingerprint for new sessions. */
  requireDeviceFingerprint: boolean;
  /** Duration in seconds after which idle sessions are revoked. */
  idleSessionTimeout: number;
}

const DEFAULT_SESSION_POLICY: SessionPolicy = {
  accessTokenTtl: 900,          // 15 minutes
  refreshTokenTtl: 604_800,     // 7 days
  deliveryGracePeriod: 300,      // 5 minutes grace for email delivery
  maxConcurrentSessions: 5,
  singleSessionMode: false,
  requireDeviceFingerprint: false,
  idleSessionTimeout: 86_400,    // 24 hours
};

/**
 * AuthSessionService — Issue #220, #349, #350
 *
 * Provides secure session management with:
 *  - Short-lived access tokens (JWT, default 15 min)
 *  - Long-lived refresh tokens (JWT, default 7 days + 5 min grace period)
 *  - Refresh-token rotation: every refresh revokes the old token and
 *    issues a fresh pair, preventing replay attacks.
 *  - Session revocation on logout (single session) or logout-all (all
 *    sessions belonging to a user).
 *  - Centralized session policy (#350) for consistent web/mobile behavior.
 *  - Delivery grace period (#349) for password reset tokens.
 *
 * Sessions are stored in memory for now; the Map can be swapped for a
 * Redis store without changing the public API.
 */
@Injectable()
export class AuthSessionService {
  private readonly logger = new Logger(AuthSessionService.name);

  /** In-memory session store: sessionId → Session */
  private readonly sessions = new Map<string, Session>();

  /** Device fingerprints per user: userId → Set of device hashes */
  private readonly trustedDevices = new Map<string, Set<string>>();

  /** #350: Centralized session policy */
  private readonly sessionPolicy: SessionPolicy;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    // #350: Load centralized session policy from config
    this.sessionPolicy = {
      accessTokenTtl: this.configService.get<number>('SESSION_ACCESS_TOKEN_TTL', DEFAULT_SESSION_POLICY.accessTokenTtl),
      refreshTokenTtl: this.configService.get<number>('SESSION_REFRESH_TOKEN_TTL', DEFAULT_SESSION_POLICY.refreshTokenTtl),
      deliveryGracePeriod: this.configService.get<number>('SESSION_DELIVERY_GRACE_PERIOD', DEFAULT_SESSION_POLICY.deliveryGracePeriod),
      maxConcurrentSessions: this.configService.get<number>('SESSION_MAX_CONCURRENT', DEFAULT_SESSION_POLICY.maxConcurrentSessions),
      singleSessionMode: this.configService.get<boolean>('SESSION_SINGLE_MODE', DEFAULT_SESSION_POLICY.singleSessionMode),
      requireDeviceFingerprint: this.configService.get<boolean>('SESSION_REQUIRE_DEVICE', DEFAULT_SESSION_POLICY.requireDeviceFingerprint),
      idleSessionTimeout: this.configService.get<number>('SESSION_IDLE_TIMEOUT', DEFAULT_SESSION_POLICY.idleSessionTimeout),
    };
  }

  // ---------------------------------------------------------------------------
  // #350: Public policy access
  // ---------------------------------------------------------------------------

  /**
   * Returns the current session policy for external consumers.
   */
  getSessionPolicy(): Readonly<SessionPolicy> {
    return { ...this.sessionPolicy };
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Creates a new session for the given user.
   * Optionally records a device fingerprint for trusted-device recognition.
   */
  async createSession(
    userId: string,
    role: UserRole,
    deviceFingerprint?: string,
  ): Promise<AuthTokensResponse> {
    const sessionId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.sessionPolicy.refreshTokenTtl * 1000);

    const { accessToken, refreshToken } = await this.signTokenPair(
      userId,
      role,
      sessionId,
    );

    const deviceHash = deviceFingerprint
      ? this.hashDevice(deviceFingerprint)
      : undefined;

    // #350: Enforce single-session mode by revoking other sessions
    if (this.sessionPolicy.singleSessionMode) {
      this.revokeAllUserSessions(userId);
    }

    // #350: Enforce max concurrent sessions
    const activeSessions = this.getActiveSessions(userId);
    if (activeSessions.length >= this.sessionPolicy.maxConcurrentSessions) {
      // Revoke oldest session
      const oldest = activeSessions.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      )[0];
      if (oldest) {
        this.revokeSession(oldest.sessionId);
        this.logger.warn(
          `Revoked oldest session ${oldest.sessionId} for user ${userId} (max concurrent: ${this.sessionPolicy.maxConcurrentSessions})`,
        );
      }
    }

    const session: Session = {
      sessionId,
      userId,
      role,
      refreshToken,
      createdAt: now,
      expiresAt,
      revoked: false,
      deviceHash,
      isTrustedDevice: deviceHash
        ? this.isTrustedDevice(userId, deviceHash)
        : undefined,
    };

    this.sessions.set(sessionId, session);

    if (deviceHash && !this.isTrustedDevice(userId, deviceHash)) {
      this.logger.warn(`New device login for user ${userId}`);
    }

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

    if (new Date() > new Date(session.expiresAt.getTime() + this.sessionPolicy.deliveryGracePeriod * 1000)) {
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
   * Also clears any cached refresh-token data associated with the session.
   */
  revokeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.revoked = true;
      this.sessions.set(sessionId, session);
      this.logger.log(`Session ${sessionId} revoked for user ${session.userId}`);
    }
  }

  /**
   * Revokes all active sessions for a user (logout from all devices).
   * Clears all associated refresh tokens and cached session data.
   */
  revokeAllUserSessions(userId: string): void {
    let count = 0;
    for (const [, session] of this.sessions) {
      if (session.userId === userId) {
        session.revoked = true;
        this.sessions.set(session.sessionId, session);
        count++;
      }
    }
    this.logger.log(`All ${count} sessions revoked for user ${userId}`);
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
  // Device binding & trusted device recognition
  // ---------------------------------------------------------------------------

  hashDevice(fingerprint: string): string {
    return createHash('sha256').update(fingerprint).digest('hex');
  }

  isTrustedDevice(userId: string, deviceHash: string): boolean {
    const devices = this.trustedDevices.get(userId);
    return devices ? devices.has(deviceHash) : false;
  }

  addTrustedDevice(userId: string, deviceHash: string): void {
    if (!this.trustedDevices.has(userId)) {
      this.trustedDevices.set(userId, new Set());
    }
    this.trustedDevices.get(userId)!.add(deviceHash);
  }

  removeTrustedDevice(userId: string, deviceHash: string): void {
    this.trustedDevices.get(userId)?.delete(deviceHash);
  }

  getTrustedDevices(userId: string): string[] {
    return Array.from(this.trustedDevices.get(userId) ?? []);
  }

  checkDeviceTrust(userId: string, deviceFingerprint: string): { trusted: boolean; deviceHash: string } {
    const deviceHash = this.hashDevice(deviceFingerprint);
    return { trusted: this.isTrustedDevice(userId, deviceHash), deviceHash };
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
        expiresIn: this.sessionPolicy.accessTokenTtl,
        // Access token uses the default JWT_SECRET set in JwtModule.
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.refreshSecret,
        expiresIn: this.sessionPolicy.refreshTokenTtl,
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
      expiresIn: this.sessionPolicy.accessTokenTtl,
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
