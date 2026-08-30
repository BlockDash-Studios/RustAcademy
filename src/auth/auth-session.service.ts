import { Injectable, UnauthorizedException, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { randomUUID, createHash } from "crypto";
import { UserRole } from "./enums/user-role.enum";
import { JwtPayload } from "./interfaces/jwt-payload.interface";
import {
  AuthTokensResponse,
  RefreshTokenPayload,
  Session,
} from "./interfaces/session.interface";
import { RedisService } from "../redis/redis.service";

export interface SessionPolicy {
  accessTokenTtl: number;
  refreshTokenTtl: number;
  deliveryGracePeriod: number;
  maxConcurrentSessions: number;
  singleSessionMode: boolean;
  requireDeviceFingerprint: boolean;
  idleSessionTimeout: number;
}

export interface LogoutResult {
  success: true;
}

const DEFAULT_SESSION_POLICY = {
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

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.sessionPolicy = {
      accessTokenTtl: this.configService.get<number>(
        "SESSION_ACCESS_TOKEN_TTL",
        DEFAULT_SESSION_POLICY.accessTokenTtl,
      ),
      refreshTokenTtl: this.configService.get<number>(
        "SESSION_REFRESH_TOKEN_TTL",
        DEFAULT_SESSION_POLICY.refreshTokenTtl,
      ),
      deliveryGracePeriod: this.configService.get<number>(
        "SESSION_DELIVERY_GRACE_PERIOD",
        DEFAULT_SESSION_POLICY.deliveryGracePeriod,
      ),
      maxConcurrentSessions: this.configService.get<number>(
        "SESSION_MAX_CONCURRENT",
        DEFAULT_SESSION_POLICY.maxConcurrentSessions,
      ),
      singleSessionMode: this.configService.get<boolean>(
        "SESSION_SINGLE_MODE",
        DEFAULT_SESSION_POLICY.singleSessionMode,
      ),
      requireDeviceFingerprint: this.configService.get<boolean>(
        "SESSION_REQUIRE_DEVICE",
        DEFAULT_SESSION_POLICY.requireDeviceFingerprint,
      ),
      idleSessionTimeout: this.configService.get<number>(
        "SESSION_IDLE_TIMEOUT",
        DEFAULT_SESSION_POLICY.idleSessionTimeout,
      ),
    };
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
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
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
      refreshToken,
      createdAt: now,
      expiresAt,
      revoked: false,
      deviceHash,
      isTrustedDevice: deviceHash
        ? await this.isTrustedDevice(userId, deviceHash)
        : undefined,
    };

    await this.redisService.set(
      this.sessionKey(sessionId),
      session,
      this.sessionPolicy.refreshTokenTtl * 1000,
    );
    await this.addSessionToUser(userId, sessionId);

    if (deviceHash && !session.isTrustedDevice) {
      this.logger.warn(`New device login for user ${userId}`);
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
        error: "INVALID_REFRESH_TOKEN",
        message: "Refresh token is invalid or has expired",
      });
    }

    const session = await this.getSession(payload.sessionId);
    if (!session || session.revoked) {
      throw new UnauthorizedException({
        error: "SESSION_NOT_FOUND",
        message: "Session has been revoked or does not exist",
      });
    }

    if (session.refreshToken !== rawRefreshToken) {
      session.revoked = true;
      await this.saveSession(session);
      throw new UnauthorizedException({
        error: "TOKEN_REUSE_DETECTED",
        message: "Refresh token has already been used; session revoked",
      });
    }

    if (
      new Date() >
      new Date(
        session.expiresAt.getTime() +
          this.sessionPolicy.deliveryGracePeriod * 1000,
      )
    ) {
      session.revoked = true;
      await this.saveSession(session);
      throw new UnauthorizedException({
        error: "SESSION_EXPIRED",
        message: "Session has expired; please log in again",
      });
    }

    session.revoked = true;
    await this.saveSession(session);

    return this.createSession(session.userId, session.role);
  }

  /**
   * Idempotent logout entry point for controllers.
   *
   * Always resolves to { success: true } and never throws — a retried,
   * duplicated, or out-of-order logout request (missing token, unknown
   * session, already-revoked session, malformed token) is treated as
   * "the session is already logged out", which is the desired end state.
   * This intentionally never re-creates or re-persists a session, so a
   * repeated call cannot resurrect state that was already cleaned up.
   */
  async logout(rawRefreshToken?: string): Promise<LogoutResult> {
    const sessionId = this.extractSessionId(rawRefreshToken);
    if (sessionId) {
      await this.revokeSessionIdempotent(sessionId);
    }
    return { success: true };
  }

  /**
   * Revokes a session by id. Safe to call multiple times: a missing
   * session or an already-revoked session are both treated as a
   * successful no-op rather than an error.
   */
  async revokeSession(sessionId: string): Promise<void> {
    await this.revokeSessionIdempotent(sessionId);
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    const sessionIds = await this.getUserSessionIds(userId);
    let count = 0;
    for (const sessionId of sessionIds) {
      const session = await this.getSession(sessionId);
      if (session && !session.revoked) {
        session.revoked = true;
        await this.saveSession(session);
        count++;
      }
    }
    this.logger.log(`All ${count} sessions revoked for user ${userId}`);
  }

  async getActiveSessions(
    userId: string,
  ): Promise<Omit<Session, "refreshToken">[]> {
    const sessionIds = await this.getUserSessionIds(userId);
    const now = new Date();
    const result: Omit<Session, "refreshToken">[] = [];
    for (const sessionId of sessionIds) {
      const session = await this.getSession(sessionId);
      if (
        session &&
        session.userId === userId &&
        !session.revoked &&
        session.expiresAt > now
      ) {
        const { refreshToken: _rt, ...rest } = session;
        result.push(rest);
      }
    }
    return result;
  }

  hashDevice(fingerprint: string): string {
    return createHash("sha256").update(fingerprint).digest("hex");
  }

  async isTrustedDevice(userId: string, deviceHash: string): Promise<boolean> {
    const devices = await this.getTrustedDevices(userId);
    return devices.includes(deviceHash);
  }

  async addTrustedDevice(userId: string, deviceHash: string): Promise<void> {
    const devices = await this.getTrustedDevices(userId);
    if (!devices.includes(deviceHash)) {
      devices.push(deviceHash);
      await this.redisService.set(this.trustedDevicesKey(userId), devices);
    }
  }

  async removeTrustedDevice(userId: string, deviceHash: string): Promise<void> {
    const devices = await this.getTrustedDevices(userId);
    const index = devices.indexOf(deviceHash);
    if (index !== -1) {
      devices.splice(index, 1);
      await this.redisService.set(this.trustedDevicesKey(userId), devices);
    }
  }

  async getTrustedDevices(userId: string): Promise<string[]> {
    const devices = await this.redisService.get(this.trustedDevicesKey(userId));
    return Array.isArray(devices) ? (devices as string[]) : [];
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

  private get refreshSecret(): string {
    return this.configService.get<string>(
      "JWT_REFRESH_SECRET",
      "refresh_secret",
    );
  }

  /**
   * Pulls a sessionId out of a raw refresh token without throwing.
   * Verification failures, expiry, and malformed tokens all resolve to
   * `undefined` rather than an error — logout should never fail just
   * because the token being logged out with is already dead.
   */
  private extractSessionId(rawRefreshToken?: string): string | undefined {
    if (!rawRefreshToken) {
      return undefined;
    }
    try {
      const decoded = this.jwtService.decode(
        rawRefreshToken,
      ) as RefreshTokenPayload | null;
      return decoded?.sessionId;
    } catch {
      return undefined;
    }
  }

  /**
   * Single source of truth for "revoke this session id, safely, exactly
   * once". Fetch-missing and already-revoked are both no-ops so retries
   * are indistinguishable from the first successful call, and neither
   * path re-writes a session that no longer needs to exist in Redis.
   */
  private async revokeSessionIdempotent(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);

    if (!session) {
      this.logger.debug(
        `Logout no-op: session ${sessionId} not found (already revoked/expired/evicted)`,
      );
      return;
    }

    if (session.revoked) {
      this.logger.debug(`Logout no-op: session ${sessionId} already revoked`);
      return;
    }

    session.revoked = true;
    await this.saveSession(session);
    this.logger.log(`Session ${sessionId} revoked for user ${session.userId}`);
  }

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
      tokenType: "Bearer",
      expiresIn: this.sessionPolicy.accessTokenTtl,
    };
  }

  private async getSession(sessionId: string): Promise<Session | null> {
    const raw = await this.redisService.get(this.sessionKey(sessionId));
    if (!raw) return null;
    return this.deserializeSession(raw as any);
  }

  private async saveSession(session: Session): Promise<void> {
    const ttlMs = Math.max(session.expiresAt.getTime() - Date.now(), 1000);
    await this.redisService.set(
      this.sessionKey(session.sessionId),
      session,
      ttlMs,
    );
  }

  private deserializeSession(data: any): Session {
    return {
      ...data,
      createdAt: new Date(data.createdAt),
      expiresAt: new Date(data.expiresAt),
    };
  }

  private async getUserSessionIds(userId: string): Promise<string[]> {
    const raw = await this.redisService.get(this.userSessionsKey(userId));
    return Array.isArray(raw) ? (raw as string[]) : [];
  }

  private async addSessionToUser(
    userId: string,
    sessionId: string,
  ): Promise<void> {
    const sessionIds = await this.getUserSessionIds(userId);
    if (!sessionIds.includes(sessionId)) {
      sessionIds.push(sessionId);
      await this.redisService.set(this.userSessionsKey(userId), sessionIds);
    }
  }

  private sessionKey(sessionId: string): string {
    return `auth:session:${sessionId}`;
  }

  private userSessionsKey(userId: string): string {
    return `auth:user_sessions:${userId}`;
  }

  private trustedDevicesKey(userId: string): string {
    return `auth:trusted_devices:${userId}`;
  }
}
