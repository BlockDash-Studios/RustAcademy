import { UnauthorizedException } from '@nestjs/common';
import { AuthSessionService } from './auth-session.service';
import { UserRole } from './enums/user-role.enum';
import { Session } from './interfaces/session.interface';
import { RedisService } from '../redis/redis.service';
import { AuditLogService } from '../audit/audit.service';

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
    const now = Date.now();
    const sessionFactory = (sessionId: string): Session => ({
      sessionId,
      userId: 'user-1',
      role: UserRole.LEARNER,
      refreshTokenHash: 'hash-of-different-token',
      createdAt: new Date(now),
      expiresAt: new Date(now + 60_000),
      absoluteExpiresAt: new Date(now + 60_000 + 300_000),
      idleExpiresAt: new Date(now + 86_400_000),
      deliveryGraceSeconds: 300,
      lastActivityAt: new Date(now),
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

  it('updates lastActivityAt on valid activity', async () => {
    const now = Date.now();
    const session: Session = {
      sessionId: 'session-1',
      userId: 'user-1',
      role: UserRole.LEARNER,
      refreshTokenHash: 'hash',
      createdAt: new Date(now),
      expiresAt: new Date(now + 60_000),
      absoluteExpiresAt: new Date(now + 300_000),
      idleExpiresAt: new Date(now + 86_400_000),
      deliveryGraceSeconds: 300,
      lastActivityAt: new Date(now),
      revoked: false,
    };
    const redis = (service as unknown as { redis: RedisService }).redis;
    await redis.set('session:session-1', JSON.stringify(session));
    await redis.sadd('userSessions:user-1', 'session-1');

    await service.validateSession('session-1');

    const stored = JSON.parse(await redis.get('session:session-1') as string) as Session;
    expect(stored.revoked).toBe(false);
    expect(new Date(stored.lastActivityAt).getTime()).toBeGreaterThanOrEqual(now);
  });

  it('revokes idle sessions on validation', async () => {
    const now = Date.now();
    const session: Session = {
      sessionId: 'session-1',
      userId: 'user-1',
      role: UserRole.LEARNER,
      refreshTokenHash: 'hash',
      createdAt: new Date(now - 100_000),
      expiresAt: new Date(now + 60_000),
      absoluteExpiresAt: new Date(now + 300_000),
      idleExpiresAt: new Date(now - 10_000),
      deliveryGraceSeconds: 300,
      lastActivityAt: new Date(now - 90_000_000),
      revoked: false,
    };
    const redis = (service as unknown as { redis: RedisService }).redis;
    await redis.set('session:session-1', JSON.stringify(session));
    await redis.sadd('userSessions:user-1', 'session-1');

    await expect(service.validateSession('session-1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    const stored = JSON.parse(await redis.get('session:session-1') as string) as Session;
    expect(stored.revoked).toBe(true);
  });
});
