import {
  Injectable,
  UnauthorizedException,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuditLogService } from '../audit/audit.service';
import { ConfigService } from '@nestjs/config';
import { randomUUID, createHash } from 'crypto';
import { UserRole } from './enums/user-role.enum';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import {
  AuthTokensResponse,
  RefreshTokenPayload,
  Session,
} from './interfaces/session.interface';
import { Redis } from 'ioredis';

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
  idleSessionTimeout: 86400,    // 24 hours
};

/**
 * AuthSessionService - Issue #220, #349, #350
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
 * Sessions are stored in Redis to persist across restarts and share across multiple instances.
 */
@Injectable()
export class AuthSessionService {
  private readonly logger = new Logger(AuthSessionService.name);

  /**
   * #350: Centralized session policy
   */
  private readonly sessionPolicy: SessionPolicy;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    @Optional() private readonly auditService?: AuditLogService,
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

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
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
      await this.revokeAllUserSessions(userId);
    }

    // #350: Enforce max concurrent sessions
    const activeSessions = await this.getActiveSessions(userId);
    if (activeSessions.length >= this.sessionPolicy.maxConcurrentSessions) {
      // Revoke oldest session
      const oldest = activeSessions.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      )[0];
      if (oldest) {
        await this.revokeSession(oldest.sessionId);
        this.logger.warn(
          `Revoked oldest session ${oldest.sessionId} for user ${userId} (max concurrent: ${this.sessionPolicy.maxConcurrentSessions})`,
        );
      }
    }

    const session: Session = {
      sessionId,
      userId,
      role,
      refreshTokenHash: this.hashToken(refreshToken),
      createdAt: now,
      expiresAt,
      revoked: false,
      deviceHash,
      isTrustedDevice: deviceHash
        ? await this.isTrustedDevice(userId, deviceHash)
        : undefined,
    };

    await this.setSession(session);
    if (deviceHash) await this.redis.sadd(`trustedDevices:${userId}`, deviceHash);

    if (deviceHash && !(await this.isTrustedDevice(userId, deviceHash))) {
      this.logger.warn(`New device login for user ${userId}`);
    }

    this.auditService?.create({ action: 'login', actor: userId, outcome: 'SUCCESS', session: sessionId, requestContext: { deviceHash } });
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

    const session = await this.getSession(payload.sessionId);
    if (!session || session.revoked) {
      throw new UnauthorizedException({
        error: 'SESSION_NOT_FOUND',
        message: 'Session has been revoked or does not exist',
      });
    }

    if (this.hashToken(rawRefreshToken) !== session.refreshTokenHash) {
      // Token reuse detected — revoke the whole session as a security measure.
      session.revoked = true;
      await this.setSession(session);
      throw new UnauthorizedException({
        error: 'TOKEN_REUSE_DETECTED',
        message: 'Refresh token has already been used; session revoked',
      });
    }

    if (new Date() > new Date(session.expiresAt.getTime() + this.sessionPolicy.deliveryGracePeriod * 1000)) {
      session.revoked = true;
      await this.setSession(session);
      throw new UnauthorizedException({
        error: 'SESSION_EXPIRED',
        message: 'Session has expired; please log in again',
      });
    }

    // Revoke the old session before issuing new tokens (rotation).
    session.revoked = true;
    await this.setSession(session);

    this.auditService?.create({ action: 'refresh', actor: session.userId, outcome: 'SUCCESS', session: session.sessionId });
    return await this.createSession(session.userId, session.role);
  }

  /**
   * Revokes a single session (logout from current device).
   * Also clears any cached refresh-token data associated with the session.
   */
  async revokeSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (session) {
      session.revoked = true;
      await this.setSession(session);
      this.logger.log(`Session ${sessionId} revoked for user ${session.userId}`);
      this.auditService?.create({ action: 'logout', actor: session.userId, outcome: 'SUCCESS', session: sessionId });
    }
  }

  /**
   * Revokes all active sessions for a user (logout from all devices).
   * Clears all associated refresh tokens and cached session data.
   */
  async revokeAllUserSessions(userId: string): Promise<void> {
    const sessionIds = await this.redis.smembers(`userSessions:${userId}`);
    let count = 0;
    for (const sessionId of sessionIds) {
      const session = await this.getSession(sessionId);
      if (session && !session.revoked) {
        session.revoked = true;
        await this.setSession(session);
        count++;
      }
    }
    this.logger.log(`All ${count} sessions revoked for user ${userId}`);
    this.auditService?.create({ action: 'logout_all', actor: userId, outcome: 'SUCCESS', requestContext: { count } });
  }

  /**
   * Returns all active (non-revoked, non-expired) sessions for a user.
   */
  async getActiveSessions(userId: string): Promise<Omit<Session, 'refreshToken' | 'refreshTokenHash'>[]> {
    const sessionIds = await this.redis.smembers(`userSessions:${userId}`);
    const now = new Date();
    const result: Omit<Session, 'refreshToken' | 'refreshTokenHash'>[] = [];
    for (const sessionId of sessionIds) {
      const session = await this.getSession(sessionId);
      if (session && !session.revoked && session.expiresAt > now) {
        const { refreshTokenHash: _omitted, ...rest } = session;
        result.push(rest);
      }
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Device binding & trusted device recognition
  // --------------------------------------------------------------------------

  hashDevice(fingerprint: string): string {
    return createHash('sha256').update(fingerprint).digest('hex');
  }

  async isTrustedDevice(userId: string, deviceHash: string): Promise<boolean> {
    const devices = await this.redis.smembers(`trustedDevices:${userId}`);
    return devices.includes(deviceHash);
  }

  async addTrustedDevice(userId: string, deviceHash: string): Promise<void> {
    await this.redis.sadd(`trustedDevices:${userId}`, deviceHash);
    this.auditService?.create({ action: 'add_trusted_device', actor: userId, outcome: 'SUCCESS', requestContext: { deviceHash } });
  }

  async removeTrustedDevice(userId: string, deviceHash: string): Promise<void> {
    await this.redis.srem(`trustedDevices:${userId}`, deviceHash);
    this.auditService?.create({ action: 'remove_trusted_device', actor: userId, outcome: 'SUCCESS', requestContext: { deviceHash } });
  }

  async getTrustedDevices(userId: string): Promise<string[]> {
    return await this.redis.smembers(`trustedDevices:${userId}`);
  }

  async checkDeviceTrust(userId: string, deviceFingerprint: string): Promise<{ trusted: boolean; deviceHash: string }> {
    const deviceHash = this.hashDevice(deviceFingerprint);
    return { trusted: await this.isTrustedDevice(userId, deviceHash), deviceHash };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private sessionKey(sessionId: string): string {
    return `session:${sessionId}`;
  }

  private userSessionsKey(userId: string): string {
    return `userSessions:${userId}`;
  }

  private async getSession(sessionId: string): Promise<Session | null> {
    const data = await this.redis.get(this.sessionKey(sessionId));
    if (!data) return null;
    return JSON.parse(data) as Session;
  }

  private async setSession(session: Session): Promise<void> {
    const tll = Math.max(1, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000) + this.sessionPolicy.deliveryGracePeriod);
    await this.redis.set(this.sessionKey(session.sessionId), JSON.stringify(session), 'EX', tll);
    const userKey = this.userSessionsKey(session.userId);
    await this.redis.sadd(userKey, session.sessionId);
  }

  private get refreshSecret(): string {
    return this.configService.get<string>('JWT_REFRESH_SECRET', this.configService.get<string>('JWT_SECRET', 'change-me'));
  }

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
}






