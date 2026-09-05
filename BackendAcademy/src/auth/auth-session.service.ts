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
  RefreshTokenPayload,
  AuthTokensResponse,
  Session,
} from './interfaces/session.interface';
import { RedisService } from '../redis/redis.service';

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
  private readonly accessSecret: string;
  private readonly refreshSecret: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Optional() @Inject(RedisService) private readonly redis: RedisService = new RedisService(),
    @Optional() private readonly auditService?: AuditLogService,
  ) {
    // #350: Load centralized session policy from config
    this.sessionPolicy = {
      accessTokenTtl: this.configService.get<number>(
        'SESSION_ACCESS_TOKEN_TTL',
        DEFAULT_SESSION_POLICY.accessTokenTtl,
      ),
      refreshTokenTtl: this.configService.get<number>(
        'SESSION_REFRESH_TOKEN_TTL',
        DEFAULT_SESSION_POLICY.refreshTokenTtl,
      ),
      deliveryGracePeriod: this.configService.get<number>(
        'SESSION_DELIVERY_GRACE_PERIOD',
        DEFAULT_SESSION_POLICY.deliveryGracePeriod,
      ),
      maxConcurrentSessions: this.configService.get<number>(
        'SESSION_MAX_CONCURRENT',
        DEFAULT_SESSION_POLICY.maxConcurrentSessions,
      ),
      singleSessionMode: this.configService.get<boolean>(
        'SESSION_SINGLE_MODE',
        DEFAULT_SESSION_POLICY.singleSessionMode,
      ),
      requireDeviceFingerprint: this.configService.get<boolean>(
        'SESSION_REQUIRE_DEVICE',
        DEFAULT_SESSION_POLICY.requireDeviceFingerprint,
      ),
      idleSessionTimeout: this.configService.get<number>(
        'SESSION_IDLE_TIMEOUT',
        DEFAULT_SESSION_POLICY.idleSessionTimeout,
      ),
    };

    this.accessSecret = this.configService.get<string>(
      'JWT_ACCESS_SECRET',
      'default-access-secret',
    );
    this.refreshSecret = this.configService.get<string>(
      'JWT_REFRESH_SECRET',
      'default-refresh-secret',
    );
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
    const expiresAt = new Date(
      now.getTime() + this.sessionPolicy.refreshTokenTtl * 1000,
    );
    const { accessToken, refreshToken } = await this.signTokenPair(
      userId,
      role,
      sessionId,
    );
    const deviceHash = deviceFingerprint
      ? this.hashDevice(deviceFingerprint)
      : undefined;

    if (this.sessionPolicy.singleSessionMode) {
      await this.revokeAllUserSessions(userId);
    }

    const activeSessions = await this.getActiveSessions(userId);
    if (activeSessions.length >= this.sessionPolicy.maxConcurrentSessions) {
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
      absoluteExpiresAt: expiresAt,
      idleExpiresAt: new Date(
        now.getTime() + this.sessionPolicy.idleSessionTimeout * 1000,
      ),
      deliveryGraceSeconds: this.sessionPolicy.deliveryGracePeriod,
      revoked: false,
      deviceHash,
      isTrustedDevice: deviceHash
        ? await this.isTrustedDevice(userId, deviceHash)
        : undefined,
    };

    await this.setSession(session);
    if (deviceHash) {
      await this.redis.sadd(`trustedDevices:${userId}`, deviceHash);
    }

    if (deviceHash && !(await this.isTrustedDevice(userId, deviceHash))) {
      this.logger.warn(`New device login for user ${userId}`);
    }

    if (this.auditService) {
      this.auditService.create({
        action: 'login',
        actor: userId,
        outcome: 'SUCCESS',
        session: sessionId,
        requestContext: { deviceHash },
      });
    }

    return this.buildTokensResponse(accessToken, refreshToken);
  }

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

    return this.withRefreshLock(payload.sessionId, async () => {
      const session = await this.getSession(payload.sessionId);
      if (!session || session.revoked) {
        throw new UnauthorizedException({
          error: 'SESSION_NOT_FOUND',
          message: 'Session has been revoked or does not exist',
        });
      }

      if (this.hashToken(rawRefreshToken) !== session.refreshTokenHash) {
        // A replay indicates that the user's refresh-token family may be compromised.
        await this.revokeAllUserSessions(session.userId, 'token_reuse');
        throw new UnauthorizedException({
          error: 'TOKEN_REUSE_DETECTED',
          message: 'Refresh token has already been used; session revoked',
        });
      }

      const now = new Date();
      if (this.isSessionExpired(session, now)) {
        session.revoked = true;
        await this.setSession(session);
        throw new UnauthorizedException({
          error: 'SESSION_EXPIRED',
          message: 'Session has expired; please log in again',
        });
      }

      if (this.isSessionIdle(session, now)) {
        session.revoked = true;
        await this.setSession(session);
        throw new UnauthorizedException({
          error: 'SESSION_IDLE_TIMEOUT',
          message: 'Session has been idle for too long; please log in again',
        });
      }

      session.revoked = true;
      await this.setSession(session);

      if (this.auditService) {
        this.auditService.create({
          action: 'refresh',
          actor: session.userId,
          outcome: 'SUCCESS',
          session: session.sessionId,
        });
      }

      return this.createSession(session.userId, session.role);
    });
  }

  /**
   * Revokes a single session (logout from current device).
   */
  async revokeSession(sessionId: string, reason = 'logout'): Promise<void> {
    const session = await this.getSession(sessionId);
    if (session) {
      session.revoked = true;
      await this.setSession(session);
      this.logger.log(`Session ${sessionId} revoked for user ${session.userId}`);
      if (this.auditService) {
        this.auditService.create({
          action: reason,
          actor: session.userId,
          outcome: 'SUCCESS',
          session: sessionId,
        });
      }
    }
  }

  /**
   * Revokes all active sessions for a user (logout from all devices).
   */
  async revokeAllUserSessions(
    userId: string,
    reason = 'logout_all',
  ): Promise<void> {
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
    if (this.auditService) {
      this.auditService.create({
        action: reason,
        actor: userId,
        outcome: 'SUCCESS',
        requestContext: { count },
      });
    }
  }

  async onPasswordChanged(userId: string): Promise<void> {
    await this.revokeAllUserSessions(userId, 'password_changed');
  }

  async onPasswordReset(userId: string): Promise<void> {
    await this.revokeAllUserSessions(userId, 'password_reset');
  }

  async onPrivilegeChanged(userId: string): Promise<void> {
    await this.revokeAllUserSessions(userId, 'privilege_changed');
  }

  async onAccountDeleted(userId: string): Promise<void> {
    await this.revokeAllUserSessions(userId, 'account_deleted');
    await this.redis.del(`userSessions:${userId}`);
    await this.redis.del(`trustedDevices:${userId}`);
  }

  /**
   * Returns all active (non-revoked, non-expired, not idle) sessions for a user.
   */
  async getActiveSessions(
    userId: string,
  ): Promise<Omit<Session, 'refreshTokenHash'>[]> {
    const sessionIds = await this.redis.smembers(this.userSessionsKey(userId));
    const now = new Date();
    const result: Omit<Session, 'refreshTokenHash'>[] = [];
    for (const sessionId of sessionIds) {
      const session = await this.getSession(sessionId);
      if (
        session &&
        session.userId === userId &&
        !session.revoked &&
        !this.isSessionExpired(session, now) &&
        !this.isSessionIdle(session, now)
      ) {
        const { refreshTokenHash: _hash, ...rest } = session;
        result.push(rest);
      }
    }
    return result;
  }

  async validateSession(sessionId: string): Promise<Session> {
    const session = await this.getSession(sessionId);
    if (!session || session.revoked) {
      throw new UnauthorizedException({
        error: 'SESSION_NOT_FOUND',
        message: 'Session has been revoked or does not exist',
      });
    }
    const now = new Date();
    if (this.isSessionExpired(session, now)) {
      session.revoked = true;
      await this.setSession(session);
      throw new UnauthorizedException({
        error: 'SESSION_EXPIRED',
        message: 'Session has expired; please log in again',
      });
    }
    if (this.isSessionIdle(session, now)) {
      session.revoked = true;
      await this.setSession(session);
      throw new UnauthorizedException({
        error: 'SESSION_IDLE_TIMEOUT',
        message: 'Session has been idle for too long; please log in again',
      });
    }
    return session;
  }

  async validateAndRefreshSession(sessionId: string): Promise<Session> {
    const session = await this.validateSession(sessionId);
    session.lastUsedAt = new Date();
    await this.setSession(session);
    return session;
  }

  // ---------------------------------------------------------------------------
  // Device binding & trusted device recognition
  // ---------------------------------------------------------------------------

  hashDevice(fingerprint: string): string {
    return createHash('sha256').update(fingerprint).digest('hex');
  }

  async isTrustedDevice(userId: string, deviceHash: string): Promise<boolean> {
    const devices = await this.redis.smembers(`trustedDevices:${userId}`);
    return devices.includes(deviceHash);
  }

  async addTrustedDevice(userId: string, deviceHash: string): Promise<void> {
    await this.redis.sadd(`trustedDevices:${userId}`, deviceHash);
    if (this.auditService) {
      this.auditService.create({
        action: 'add_trusted_device',
        actor: userId,
        outcome: 'SUCCESS',
        requestContext: { deviceHash },
      });
    }
  }

  async removeTrustedDevice(userId: string, deviceHash: string): Promise<void> {
    await this.redis.srem(`trustedDevices:${userId}`, deviceHash);
    if (this.auditService) {
      this.auditService.create({
        action: 'remove_trusted_device',
        actor: userId,
        outcome: 'SUCCESS',
        requestContext: { deviceHash },
      });
    }
  }

  async getTrustedDevices(userId: string): Promise<string[]> {
    return this.redis.smembers(`trustedDevices:${userId}`);
  }

  async checkDeviceTrust(
    userId: string,
    deviceFingerprint: string,
  ): Promise<{ trusted: boolean; deviceHash: string }> {
    const deviceHash = this.hashDevice(deviceFingerprint);
    return {
      trusted: await this.isTrustedDevice(userId, deviceHash),
      deviceHash,
    };
  }

  private async withRefreshLock<T>(
    sessionId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
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

  private async getSession(
    sessionId: string,
  ): Promise<(Session & { lastUsedAt?: Date }) | null> {
    const data = await this.redis.get(this.sessionKey(sessionId));
    if (!data) return null;
    const session = (typeof data === 'string' ? JSON.parse(data) : data) as Session & {
      lastUsedAt?: Date;
    };
    session.createdAt = new Date(session.createdAt);
    session.expiresAt = new Date(session.expiresAt);
    if (session.lastUsedAt) session.lastUsedAt = new Date(session.lastUsedAt);
    return session;
  }

  private async setSession(
    session: Session & { lastUsedAt?: Date },
  ): Promise<void> {
    const ttlSeconds = Math.max(
      1,
      Math.floor((session.expiresAt.getTime() - Date.now()) / 1000) +
        this.sessionPolicy.deliveryGracePeriod,
    );
    await this.redis.set(
      this.sessionKey(session.sessionId),
      JSON.stringify(session),
      ttlSeconds * 1000,
    );
    await this.redis.sadd(
      this.userSessionsKey(session.userId),
      session.sessionId,
    );
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
    const refreshPayload: RefreshTokenPayload = {
      sub: userId,
      role,
      sessionId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.accessSecret,
        expiresIn: this.sessionPolicy.accessTokenTtl,
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

  private isSessionExpired(session: Session, now: Date): boolean {
    const expiryWithGrace = new Date(
      new Date(session.expiresAt).getTime() +
        this.sessionPolicy.deliveryGracePeriod * 1000,
    );
    return now > expiryWithGrace;
  }

  private isSessionIdle(
    session: Session & { lastUsedAt?: Date },
    now: Date,
  ): boolean {
    const lastUsedAt = session.lastUsedAt
      ? new Date(session.lastUsedAt)
      : new Date(session.createdAt);
    return (
      now.getTime() - lastUsedAt.getTime() >
      this.sessionPolicy.idleSessionTimeout * 1000
    );
  }
}