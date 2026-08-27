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

export interface SessionPolicy {
  accessTokenTtl: number;
  refreshTokenTtl: number;
  deliveryGracePeriod: number;
  maxConcurrentSessions: number;
  singleSessionMode: boolean;
  requireDeviceFingerprint: boolean;
  idleSessionTimeout: number;
}

const DEFAULT_SESSION_POLICY: SessionPolicy = {
  accessTokenTtl: 900,
  refreshTokenTtl: 604_800,
  deliveryGracePeriod: 300,
  maxConcurrentSessions: 5,
  singleSessionMode: false,
  requireDeviceFingerprint: false,
  idleSessionTimeout: 86_400,
};

@Injectable()
export class AuthSessionService {
  private readonly logger = new Logger(AuthSessionService.name);
  private readonly sessionPolicy: SessionPolicy;
  private readonly refreshLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    @Optional() private readonly auditService?: AuditLogService,
  ) {
    // #350: Load centralized session policy from config.
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

  /**
   * Returns the current session policy for external consumers.
   */
  getSessionPolicy(): Readonly<SessionPolicy> {
    return { ...this.sessionPolicy };
  }

  /**
   * BA-016: Device fingerprint policy (DEVICE_FINGERPRINT_REQUIRED).
   *
   * When `SESSION_REQUIRE_DEVICE` is enabled a fingerprint is mandatory for
   * session creation. When a fingerprint is supplied it is always hashed and
   * the raw value is never stored or logged.
   *
   * Returns the device hash when a fingerprint is present, otherwise
   * `undefined` (only allowed while the policy is disabled).
   */
  private enforceDeviceFingerprintPolicy(deviceFingerprint?: string): string | undefined {
    if (deviceFingerprint && deviceFingerprint.trim().length > 0) {
      return this.hashDevice(deviceFingerprint);
    }
    if (this.sessionPolicy.requireDeviceFingerprint) {
      throw new UnauthorizedException({
        error: 'DEVICE_FINGERPRINT_REQUIRED',
        message: 'A device fingerprint is required when device fingerprint enforcement is enabled',
      });
    }
    return undefined;
  }

  /**
   * Creates a new session for the given user.
   *
   * The `deviceFingerprint` is hashed via SHA-256 and stored as `deviceHash`;
   * the raw fingerprint is never persisted or logged. Trusted-device status
   * is captured at creation time for trust-aware auditing.
   */
  async createSession(
    userId: string,
    role: UserRole,
    deviceFingerprint?: string,
  ): Promise<AuthTokensResponse> {
    const sessionId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.sessionPolicy.refreshTokenTtl * 1000);

    const deviceHash = this.enforceDeviceFingerprintPolicy(deviceFingerprint);

    if (this.sessionPolicy.singleSessionMode) {
      await this.revokeAllUserSessions(userId);
    }

    const activeSessions = await this.getActiveSessions(userId);
    if (activeSessions.length >= this.sessionPolicy.maxConcurrentSessions) {
      const oldest = activeSessions
        .slice()
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
      if (oldest) {
        await this.revokeSession(oldest.sessionId);
        this.logger.warn(
          `Revoked oldest session ${oldest.sessionId} for user ${userId} (max concurrent: ${this.sessionPolicy.maxConcurrentSessions})`,
        );
      }
    }

    const { accessToken, refreshToken } = await this.signTokenPair(userId, role, sessionId);
    const isTrustedDevice = deviceHash
      ? await this.isTrustedDevice(userId, deviceHash)
      : undefined;

    const session: Session & { lastUsedAt: Date } = {
      sessionId,
      userId,
      role,
      refreshTokenHash: this.hashToken(refreshToken),
      createdAt: now,
      expiresAt,
      revoked: false,
      deviceHash,
      isTrustedDevice,
      lastUsedAt: now,
    };

    await this.setSession(session);
    if (deviceHash) await this.redis.sadd(`trustedDevices:${userId}`, deviceHash);

    if (deviceHash && !isTrustedDevice) {
      this.logger.warn(`New device login for user ${userId}`);
    }

    await this.audit('login', userId, { session: sessionId, requestContext: { deviceHash } });
    return this.buildTokensResponse(accessToken, refreshToken);
  }

  /**
   * Rotates a refresh token, returning a fresh token pair.
   *
   * BA-016: when the device fingerprint policy is enabled, a fingerprint must
   * be presented and must hash to the same value bound to the session. A
   * changed fingerprint revokes the session (rotation behavior) so a stolen
   * token cannot be used from a different device. The rotated session keeps
   * the device binding.
   */
  async refreshTokens(rawRefreshToken: string, deviceFingerprint?: string): Promise<AuthTokensResponse> {
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

    return this.withRefreshLock(payload.sessionId, async () => {
      const claimKey = `refreshClaim:${payload.sessionId}`;
      const claimed = await this.redis.set(claimKey, randomUUID(), 'EX', 30, 'NX');
      if (claimed !== 'OK') {
        throw new UnauthorizedException({
          error: 'SESSION_NOT_FOUND',
          message: 'Session has been revoked or does not exist',
        });
      }

      const session = await this.getSession(payload.sessionId);
      if (!session || session.revoked) {
        await this.redis.del(claimKey);
        throw new UnauthorizedException({
          error: 'SESSION_NOT_FOUND',
          message: 'Session has been revoked or does not exist',
        });
      }

      if (this.hashToken(rawRefreshToken) !== session.refreshTokenHash) {
        session.revoked = true;
        await this.setSession(session);
        await this.redis.del(claimKey);
        throw new UnauthorizedException({
          error: 'TOKEN_REUSE_DETECTED',
          message: 'Refresh token has already been used; session revoked',
        });
      }

      if (this.sessionPolicy.requireDeviceFingerprint) {
        const presentedHash = this.enforceDeviceFingerprintPolicy(deviceFingerprint);
        if (session.deviceHash && presentedHash !== session.deviceHash) {
          session.revoked = true;
          await this.setSession(session);
          await this.redis.del(claimKey);
          throw new UnauthorizedException({
            error: 'DEVICE_MISMATCH',
            message: 'Refresh token was presented from a different device; session revoked',
          });
        }
      }

      const now = new Date();
      if (this.isSessionExpired(session, now)) {
        session.revoked = true;
        await this.setSession(session);
        await this.redis.del(claimKey);
        throw new UnauthorizedException({
          error: 'SESSION_EXPIRED',
          message: 'Session has expired; please log in again',
        });
      }

      if (this.isSessionIdle(session, now)) {
        session.revoked = true;
        await this.setSession(session);
        await this.redis.del(claimKey);
        throw new UnauthorizedException({
          error: 'SESSION_IDLE_TIMEOUT',
          message: 'Session has been idle for too long; please log in again',
        });
      }

      // Rotate: revoke the old session before issuing the new token pair.
      session.revoked = true;
      await this.setSession(session);
      await this.redis.del(claimKey);

      await this.audit('refresh', session.userId, { session: session.sessionId });
      return this.createSession(session.userId, session.role, deviceFingerprint);
    });
  }

  async revokeSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (session) {
      session.revoked = true;
      await this.setSession(session);
      this.logger.log(`Session ${sessionId} revoked for user ${session.userId}`);
      await this.audit('logout', session.userId, { session: sessionId });
    }
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    const sessionIds = await this.redis.smembers(this.userSessionsKey(userId));
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
    await this.audit('logout_all', userId, { requestContext: { count } });
  }

  /**
   * Returns all active (non-revoked, non-expired, not idle) sessions for a
   * user. Refresh-token material (raw or hashed) is never returned.
   */
  async getActiveSessions(userId: string): Promise<Omit<Session, 'refreshToken' | 'refreshTokenHash'>[]> {
    const sessionIds = await this.redis.smembers(this.userSessionsKey(userId));
    const now = new Date();
    const result: Omit<Session, 'refreshToken' | 'refreshTokenHash'>[] = [];
    for (const sessionId of sessionIds) {
      const session = await this.getSession(sessionId);
      if (
        session &&
        session.userId === userId &&
        !session.revoked &&
        !this.isSessionExpired(session, now) &&
        !this.isSessionIdle(session, now)
      ) {
        const { refreshTokenHash, ...safeSession } = session;
        void refreshTokenHash;
        result.push(safeSession);
      }
    }
    return result;
  }

  // -------------------------------------------------------------------------------------------
  // Device binding & trusted device recognition
  // -------------------------------------------------------------------------------------------

  /**
   * Hashes a fingerprint with SHA-256 before it is stored or compared. The
   * raw fingerprint must never be logged or persisted.
   */
  hashDevice(fingerprint: string): string {
    return createHash('sha256').update(fingerprint).digest('hex');
  }

  async isTrustedDevice(userId: string, deviceHash: string): Promise<boolean> {
    const devices = await this.redis.smembers(`trustedDevices:${userId}`);
    return devices.includes(deviceHash);
  }

  async addTrustedDevice(userId: string, deviceHash: string): Promise<void> {
    await this.redis.sadd(`trustedDevices:${userId}`, deviceHash);
    await this.audit('add_trusted_device', userId, { requestContext: { deviceHash } });
  }

  async removeTrustedDevice(userId: string, deviceHash: string): Promise<void> {
    await this.redis.srem(`trustedDevices:${userId}`, deviceHash);
    await this.audit('remove_trusted_device', userId, { requestContext: { deviceHash } });
  }

  async getTrustedDevices(userId: string): Promise<string[]> {
    return this.redis.smembers(`trustedDevices:${userId}`);
  }

  async checkDeviceTrust(userId: string, deviceFingerprint: string): Promise<{ trusted: boolean; deviceHash: string }> {
    const deviceHash = this.hashDevice(deviceFingerprint);
    return { trusted: await this.isTrustedDevice(userId, deviceHash), deviceHash };
  }

  // -------------------------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------------------------

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async audit(
    action: string,
    actor: string,
    context: { session?: string; requestContext?: Record<string, any> } = {},
  ): Promise<void> {
    if (this.auditService) {
      await this.auditService.create({ action, actor, outcome: 'SUCCESS', ...context });
    }
  }

  private async withRefreshLock<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.refreshLocks.get(sessionId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.refreshLocks.set(sessionId, queued);

    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.refreshLocks.get(sessionId) === queued) {
        this.refreshLocks.delete(sessionId);
      }
    }
  }

  private sessionKey(sessionId: string): string {
    return `session:${sessionId}`;
  }

  private userSessionsKey(userId: string): string {
    return `userSessions:${userId}`;
  }

  private async getSession(sessionId: string): Promise<(Session & { lastUsedAt?: Date }) | null> {
    const data = await this.redis.get(this.sessionKey(sessionId));
    if (!data) return null;
    const session = JSON.parse(data) as Session & { lastUsedAt?: Date };
    return {
      ...session,
      createdAt: new Date(session.createdAt),
      expiresAt: new Date(session.expiresAt),
      ...(session.lastUsedAt ? { lastUsedAt: new Date(session.lastUsedAt) } : {}),
    };
  }

  private async setSession(session: Session & { lastUsedAt?: Date }): Promise<void> {
    const ttlSeconds = Math.max(
      1,
      Math.floor((session.expiresAt.getTime() - Date.now()) / 1000) + this.sessionPolicy.deliveryGracePeriod,
    );
    await this.redis.set(this.sessionKey(session.sessionId), JSON.stringify(session), 'EX', ttlSeconds);
    await this.redis.sadd(this.userSessionsKey(session.userId), session.sessionId);
  }

  private get refreshSecret(): string {
    return this.configService.get<string>('JWT_REFRESH_SECRET', 'change-me');
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
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.refreshSecret,
        expiresIn: this.sessionPolicy.refreshTokenTtl,
      }),
    ]);
    return { accessToken, refreshToken };
  }

  private buildTokensResponse(accessToken: string, refreshToken: string): AuthTokensResponse {
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.sessionPolicy.accessTokenTtl,
    };
  }

  private isSessionExpired(session: Session, now: Date): boolean {
    const expiryWithGrace = new Date(session.expiresAt).getTime() + this.sessionPolicy.deliveryGracePeriod * 1000;
    return now.getTime() > expiryWithGrace;
  }

  private isSessionIdle(session: Session & { lastUsedAt?: Date }, now: Date): boolean {
    const lastUsedAt = session.lastUsedAt ? new Date(session.lastUsedAt) : new Date(session.createdAt);
    return now.getTime() - lastUsedAt.getTime() > this.sessionPolicy.idleSessionTimeout * 1000;
  }
}