import {
  Injectable,
  UnauthorizedException,
  Logger,
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
    private readonly redis: RedisService,
    private readonly auditService: AuditLogService,
  ) {
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

  getSessionPolicy(): Readonly<SessionPolicy> {
    return { ...this.sessionPolicy };
  }

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
      absoluteExpiresAt: new Date(
        now.getTime() +
          this.sessionPolicy.refreshTokenTtl * 1000 +
          this.sessionPolicy.deliveryGracePeriod * 1000,
      ),
      idleExpiresAt: new Date(
        now.getTime() + this.sessionPolicy.idleSessionTimeout * 1000,
      ),
      deliveryGraceSeconds: this.sessionPolicy.deliveryGracePeriod,
      lastActivityAt: now,
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

    await this.auditService.create({
      action: 'login',
      actor: userId,
      outcome: 'SUCCESS',
      session: sessionId,
      requestContext: { deviceHash },
    });
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
      const claimKey = `refreshClaim:${payload.sessionId}`;
      const existingClaim = await this.redis.get(claimKey);
      if (existingClaim) {
        throw new UnauthorizedException({
          error: 'SESSION_NOT_FOUND',
          message: 'Session has been revoked or does not exist',
        });
      }
      await this.redis.set(claimKey, randomUUID(), 30_000);

      const session = await this.getSession(payload.sessionId);
      if (!session || session.revoked) {
        await this.redis.del(claimKey);
        throw new UnauthorizedException({
          error: 'SESSION_NOT_FOUND',
          message: 'Session has been revoked or does not exist',
        });
      }

      if (this.hashToken(rawRefreshToken) !== session.refreshTokenHash) {
        await this.revokeAllUserSessions(session.userId, 'token_reuse');
        session.revoked = true;
        await this.setSession(session);
        await this.redis.del(claimKey);
        throw new UnauthorizedException({
          error: 'TOKEN_REUSE_DETECTED',
          message: 'Refresh token has already been used; session revoked',
        });
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

      session.revoked = true;
      await this.setSession(session);
      await this.redis.del(claimKey);

      await this.auditService.create({
        action: 'refresh',
        actor: session.userId,
        outcome: 'SUCCESS',
        session: session.sessionId,
      });
      return this.createSession(session.userId, session.role);
    });
  }

  async validateSession(sessionId: string): Promise<Session> {
    return this.withRefreshLock(sessionId, async () => {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new UnauthorizedException({
          error: 'SESSION_NOT_FOUND',
          message: 'Session does not exist',
        });
      }
      if (session.revoked) {
        throw new UnauthorizedException({
          error: 'SESSION_REVOKED',
          message: 'Session has been revoked',
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

      const previousActivity = session.lastActivityAt
        ? new Date(session.lastActivityAt).getTime()
        : 0;
      const newActivity = Date.now();
      if (newActivity > previousActivity) {
        session.lastActivityAt = new Date(newActivity);
        session.idleExpiresAt = new Date(
          newActivity + this.sessionPolicy.idleSessionTimeout * 1000,
        );
        await this.setSession(session);
      }

      return session;
    });
  }

  async validateAndRefreshSession(sessionId: string): Promise<Session> {
    return this.validateSession(sessionId);
  }

  async updateLastActivity(sessionId: string): Promise<void> {
    await this.validateSession(sessionId);
  }

  async revokeSession(sessionId: string, reason = 'logout'): Promise<void> {
    const session = await this.getSession(sessionId);
    if (session) {
      session.revoked = true;
      await this.setSession(session);
      this.logger.log(`Session ${sessionId} revoked for user ${session.userId}`);
      this.auditService.create({
        action: reason,
        actor: session.userId,
        outcome: 'SUCCESS',
        session: sessionId,
      });
    }
  }

  async revokeAllUserSessions(userId: string, reason = 'logout_all'): Promise<void> {
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
    this.auditService.create({
      action: reason,
      actor: userId,
      outcome: 'SUCCESS',
      requestContext: { count },
    });
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

  async getActiveSessions(
    userId: string,
  ): Promise<Omit<Session, 'refreshTokenHash'>[]> {
    const sessionIds = await this.redis.smembers(`userSessions:${userId}`);
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
        const { refreshTokenHash, ...rest } = session;
        result.push(rest);
      }
    }
    return result;
  }

  hashDevice(fingerprint: string): string {
    return createHash('sha256').update(fingerprint).digest('hex');
  }

  async isTrustedDevice(userId: string, deviceHash: string): Promise<boolean> {
    const devices = await this.redis.smembers(`trustedDevices:${userId}`);
    return devices.includes(deviceHash);
  }

  async addTrustedDevice(userId: string, deviceHash: string): Promise<void> {
    await this.redis.sadd(`trustedDevices:${userId}`, deviceHash);
    this.auditService.create({
      action: 'add_trusted_device',
      actor: userId,
      outcome: 'SUCCESS',
      requestContext: { deviceHash },
    });
  }

  async removeTrustedDevice(userId: string, deviceHash: string): Promise<void> {
    await this.redis.srem(`trustedDevices:${userId}`, deviceHash);
    this.auditService.create({
      action: 'remove_trusted_device',
      actor: userId,
      outcome: 'SUCCESS',
      requestContext: { deviceHash },
    });
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

  private async getSession(sessionId: string): Promise<Session | null> {
    const data = await this.redis.get(this.sessionKey(sessionId));
    if (!data) return null;
    const session = JSON.parse(data as string) as Session;
    session.createdAt = new Date(session.createdAt);
    session.expiresAt = new Date(session.expiresAt);
    session.absoluteExpiresAt = new Date(session.absoluteExpiresAt);
    session.idleExpiresAt = new Date(session.idleExpiresAt);
    session.lastActivityAt = new Date(session.lastActivityAt);
    if (session.revokedAt) {
      session.revokedAt = new Date(session.revokedAt);
    }
    return session;
  }

  private async setSession(session: Session): Promise<void> {
    const ttlSeconds = Math.max(
      1,
      Math.floor(
        (session.expiresAt.getTime() - Date.now()) / 1000,
      ) + this.sessionPolicy.deliveryGracePeriod,
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

  private async signTokenPair(
    userId: string,
    role: UserRole,
    sessionId: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessPayload: JwtPayload = {
      sub: userId,
      role,
      sessionId,
      type: 'access',
    };
    const refreshPayload: RefreshTokenPayload = {
      sub: userId,
      role,
      sessionId,
      type: 'refresh',
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
      session.expiresAt.getTime() +
        this.sessionPolicy.deliveryGracePeriod * 1000,
    );
    return now > expiryWithGrace;
  }

  private isSessionIdle(session: Session, now: Date): boolean {
    const lastActivityAt = new Date(session.lastActivityAt);
    return (
      now.getTime() - lastActivityAt.getTime() >
      this.sessionPolicy.idleSessionTimeout * 1000
    );
  }
}
