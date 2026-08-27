import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthSessionService } from './auth-session.service';
import { UserRole } from './enums/user-role.enum';
import { Session } from './interfaces/session.interface';
import { RedisService } from '../redis/redis.service';
import { AuditLogService } from '../audit/audit.service';

function createRedisMock() {
  const values = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  return {
    _cache: values,
    get: jest.fn(async (key: string) => values.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
      return 'OK';
    }),
    del: jest.fn(async () => 1),
    sadd: jest.fn(async (key: string, value: string) => {
      const set = sets.get(key) ?? new Set<string>();
      set.add(value);
      sets.set(key, set);
      return 1;
    }),
    smembers: jest.fn(async (key: string) => [...(sets.get(key) ?? [])]),
    srem: jest.fn(async () => 1),
  };
}

describe('AuthSessionService refresh token concurrency', () => {
  it('accepts a refresh token at most once under concurrent requests', async () => {
    const redis = createRedisMock();
    const jwtService = {
      verifyAsync: jest.fn(async () => ({
        sub: 'user-1',
        role: UserRole.LEARNER,
        sessionId: 'session-1',
      })),
      signAsync: jest.fn(async () => 'new-token'),
    } as unknown as JwtService;
    const config = {
      get: jest.fn((_key: string, fallback: unknown) => fallback),
    } as unknown as ConfigService;
    const service = new AuthSessionService(jwtService, config, redis as any);
    const refreshToken = 'refresh-token';
    const refreshTokenHash = service['hashToken'](refreshToken);

    await redis.set(
      'session:session-1',
      JSON.stringify({
        sessionId: 'session-1',
        userId: 'user-1',
        role: UserRole.LEARNER,
        refreshTokenHash,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        revoked: false,
      }),
    );

    const results = await Promise.allSettled([
      service.refreshTokens(refreshToken),
      service.refreshTokens(refreshToken),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((results.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason.response).toMatchObject({
      error: 'SESSION_NOT_FOUND',
    });

    const stored = JSON.parse((await redis.get('session:session-1'))!);
    expect(stored.revoked).toBe(true);
  });
});

describe('AuthSessionService BA-016 device fingerprint policy', () => {
  function buildService(requireDevice: boolean) {
    const redis = createRedisMock();
    const jwtService = {
      verifyAsync: jest.fn(async () => ({
        sub: 'user-1',
        role: UserRole.LEARNER,
        sessionId: 'session-1',
      })),
      signAsync: jest.fn(async () => 'new-token'),
    } as unknown as JwtService;
    const config = {
      get: jest.fn((key: string, fallback: unknown) => {
        if (key === 'SESSION_REQUIRE_DEVICE') return requireDevice;
        return fallback;
      }),
    } as unknown as ConfigService;
    const service = new AuthSessionService(jwtService, config, redis as any);
    return { service, redis };
  }

  const sessionKey = 'session:session-1';
  const REFRESH_TOKEN = 'refresh-token';
  const deviceHashOf = (service: AuthSessionService, fp: string) => service['hashDevice'](fp);

  async function seedSession(service: AuthSessionService, redis: any, deviceHash?: string, refreshToken: string = REFRESH_TOKEN) {
    await redis.set(
      sessionKey,
      JSON.stringify({
        sessionId: 'session-1',
        userId: 'user-1',
        role: UserRole.LEARNER,
        refreshTokenHash: service['hashToken'](refreshToken),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        revoked: false,
        deviceHash,
      }),
    );
  }

  it('always stores a SHA-256 hash of the fingerprint, never the raw value', async () => {
    const { service, redis } = buildService(false);
    await service.createSession('user-1', UserRole.LEARNER, 'raw-fingerprint');

    const sessionKey = [...redis._cache.keys()].find((key: string) => key.startsWith('session:'))!;
    const stored = JSON.parse((await redis.get(sessionKey))!);
    expect(stored.deviceHash).toBe(deviceHashOf(service, 'raw-fingerprint'));
    expect(stored.deviceHash).not.toBe('raw-fingerprint');
    expect(JSON.stringify(stored)).not.toContain('raw-fingerprint');
  });

  it('records only the hashed fingerprint in trusted-device tracking', async () => {
    const { service, redis } = buildService(false);
    await service.createSession('user-1', UserRole.LEARNER, 'browser-a');

    const tracked = await redis.smembers('trustedDevices:user-1');
    expect(tracked).toEqual([deviceHashOf(service, 'browser-a')]);
    expect(tracked.join(',')).not.toContain('browser-a');
  });

  it('rejects login without a fingerprint when the policy requires one', async () => {
    const { service } = buildService(true);
    await expect(service.createSession('user-1', UserRole.LEARNER)).rejects.toHaveProperty(
      'response',
      expect.objectContaining({ error: 'DEVICE_FINGERPRINT_REQUIRED' }),
    );
  });

  it('accepts login with a fingerprint when the policy requires one', async () => {
    const { service } = buildService(true);
    await expect(service.createSession('user-1', UserRole.LEARNER, 'browser-a')).resolves.toBeDefined();
  });

  it('revokes the session when a refresh token is presented from a different device', async () => {
    const { service, redis } = buildService(true);
    await seedSession(service, redis, deviceHashOf(service, 'browser-a'));

    await expect(service.refreshTokens(REFRESH_TOKEN, 'browser-b')).rejects.toHaveProperty(
      'response',
      expect.objectContaining({ error: 'DEVICE_MISMATCH' }),
    );

    const stored = JSON.parse((await redis.get(sessionKey))!);
    expect(stored.revoked).toBe(true);
  });

  it('rotates successfully when the presented fingerprint matches the session', async () => {
    const { service, redis } = buildService(true);
    await seedSession(service, redis, deviceHashOf(service, 'browser-a'));

    await expect(service.refreshTokens(REFRESH_TOKEN, 'browser-a')).resolves.toBeDefined();
    expect(redis.set).toHaveBeenCalled();
  });

  it('keeps the device binding across rotation', async () => {
    const { service, redis } = buildService(true);
    await seedSession(service, redis, deviceHashOf(service, 'browser-a'));
    await service.refreshTokens(REFRESH_TOKEN, 'browser-a');

    const stored = JSON.parse((await redis.get(sessionKey))!);
    expect(stored.deviceHash).toBe(deviceHashOf(service, 'browser-a'));
  });

  it('marks trusted devices at login', async () => {
    const { service } = buildService(false);
    await service.createSession('user-1', UserRole.LEARNER, 'browser-a');
    await service.createSession('user-1', UserRole.LEARNER, 'browser-a');

    expect(await service.isTrustedDevice('user-1', deviceHashOf(service, 'browser-a'))).toBe(true);
  });
});

describe('AuthSessionService security revocation', () => {
  let service: AuthSessionService;
  let revokeAllUserSessions: jest.SpyInstance;

  beforeEach(() => {
    const jwtService = {
      verifyAsync: jest.fn(),
      signAsync: jest.fn(),
    };
    const configService = {
      get: jest.fn((_key: string, fallback: unknown) => fallback),
    };

    service = new AuthSessionService(
      jwtService as never,
      configService as never,
      new RedisService(),
      new AuditLogService(),
    );
    revokeAllUserSessions = jest.spyOn(service, 'revokeAllUserSessions');
  });

  it.each([
    ['password change', () => service.onPasswordChanged('user-1')],
    ['password reset', () => service.onPasswordReset('user-1')],
    ['privilege change', () => service.onPrivilegeChanged('user-1')],
    ['account deletion', () => service.onAccountDeleted('user-1')],
  ])('revokes sessions after %s', async (_event, revoke) => {
    await revoke();

    expect(revokeAllUserSessions).toHaveBeenCalledWith('user-1', expect.any(String));
  });

  it('revokes every session after refresh-token reuse', async () => {
    const sessionFactory = (sessionId: string): Session => ({
      sessionId,
      userId: 'user-1',
      role: UserRole.LEARNER,
      refreshTokenHash: 'hash-of-different-token',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      revoked: false,
    });
    const redis = (service as unknown as { redis: RedisService }).redis;
    await redis.set('session:session-1', JSON.stringify(sessionFactory('session-1')));
    await redis.set('session:session-2', JSON.stringify(sessionFactory('session-2')));
    await redis.sadd('userSessions:user-1', 'session-1');
    await redis.sadd('userSessions:user-1', 'session-2');

    const jwtService = (service as unknown as { jwtService: { verifyAsync: jest.Mock } }).jwtService;
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      role: UserRole.LEARNER,
      sessionId: 'session-1',
    });

    await expect(service.refreshTokens('replayed-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(await service.getActiveSessions('user-1')).toHaveLength(0);
    expect(revokeAllUserSessions).toHaveBeenCalledWith('user-1', 'token_reuse');
  });
});