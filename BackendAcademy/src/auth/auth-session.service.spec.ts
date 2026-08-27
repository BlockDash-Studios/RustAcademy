import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthSessionService } from './auth-session.service';
import { UserRole } from './enums/user-role.enum';

function createRedisMock() {
  const values = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  return {
    get: jest.fn(async (key: string) => values.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
      return 'OK';
    }),
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
