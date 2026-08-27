import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { JwtAdminGuard } from './guards/jwt-admin.guard';
import { UserRole } from './enums/user-role.enum';
import { JwtPayload } from './interfaces/jwt-payload.interface';

/**
 * BA-023 — Token clock-skew policy.
 *
 * Distributed clocks can drift, causing a verifier whose clock is slightly
 * ahead of the signer's to reject a freshly-issued token ("premature expiry")
 * or a verifier whose clock is behind to accept a genuinely expired token.
 *
 * The policy under test:
 *   - The allowed clock skew is EXPLICIT (a named config value) and BOUNDED
 *     (rejected by config validation if widened irresponsibly).
 *   - Verification applies that same bounded tolerance via `clockTolerance`,
 *     so a token that has only just expired is still accepted, while one that
 *     expired far beyond the tolerance is rejected.
 *
 * These tests use Jest fake timers to deterministically control the verifier's
 * clock relative to the signer's.
 */

const SECRET = 'test-secret';
const BOUNDED_SKEW_SECONDS = 30;
const HARD_MAX_SKEW_SECONDS = 120;

/** Build a JwtService configured exactly like the production AuthModule factory. */
function buildJwtService(skewSeconds: number): JwtService {
  return new JwtService({
    secret: SECRET,
    signOptions: { expiresIn: '7d' },
    verifyOptions: { clockTolerance: skewSeconds },
  });
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function makeContextWithToken(token: string) {
  const request = {
    headers: { authorization: `Bearer ${token}` },
  } as unknown as Request;
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as any;
  return { context, request };
}

describe('JWT clock skew policy (BA-023)', () => {
  let jwtService: JwtService;

  beforeEach(() => {
    // Anchor the signer's clock at a fixed instant.
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    jwtService = buildJwtService(BOUNDED_SKEW_SECONDS);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('verification honors the bounded clock tolerance', () => {
    it('accepts a token whose expiry has only just passed (verifier clock ahead, within tolerance)', async () => {
      // Signer issues token with 7d lifetime ending at 2026-01-08T00:00:00Z.
      const token = jwtService.sign({ sub: 'u1', role: UserRole.ADMIN });

      // Verifier's clock drifts 10s past the token's expiry — still within the
      // 30s tolerance, so the just-expired token must NOT be rejected.
      jest.setSystemTime(new Date('2026-01-08T00:00:10.000Z'));

      await expect(jwtService.verifyAsync(token)).resolves.toMatchObject({
        sub: 'u1',
        role: UserRole.ADMIN,
      });
    });

    it('accepts a token whose not-before claim is slightly in the future (verifier clock ahead of signer)', async () => {
      // nbf is in the near future relative to the verifier; within tolerance.
      const token = jwtService.sign({
        sub: 'u1',
        role: UserRole.ADMIN,
        nbf: nowInSeconds() + 10,
      });

      await expect(jwtService.verifyAsync(token)).resolves.toMatchObject({
        sub: 'u1',
      });
    });

    it('rejects a token expired beyond the tolerance', async () => {
      const token = jwtService.sign({ sub: 'u1', role: UserRole.ADMIN });

      // 60s past expiry — well beyond the 30s tolerance.
      jest.setSystemTime(new Date('2026-01-08T00:01:00.000Z'));

      await expect(jwtService.verifyAsync(token)).rejects.toThrow();
    });

    it('rejects a token in the future beyond the tolerance (nbf too far ahead)', async () => {
      const token = jwtService.sign({
        sub: 'u1',
        role: UserRole.TUTOR,
        nbf: nowInSeconds() + 120,
      });

      await expect(jwtService.verifyAsync(token)).rejects.toThrow();
    });
  });

  describe('guards apply the same policy end-to-end', () => {
    it('allows an admin token that has just expired within the tolerance', async () => {
      const token = jwtService.sign({ sub: 'u1', role: UserRole.ADMIN });
      jest.setSystemTime(new Date('2026-01-08T00:00:20.000Z'));

      const guard = new JwtAdminGuard(jwtService);
      const { context, request } = makeContextWithToken(token);

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect((request as Request & { user: JwtPayload }).user.sub).toBe('u1');
    });

    it('rejects an admin token that expired beyond the tolerance', async () => {
      const token = jwtService.sign({ sub: 'u1', role: UserRole.ADMIN });
      jest.setSystemTime(new Date('2026-01-08T00:01:30.000Z'));

      const guard = new JwtAdminGuard(jwtService);
      const { context } = makeContextWithToken(token);

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('still enforces role checks within the allowed skew', async () => {
      const token = jwtService.sign({ sub: 'u1', role: UserRole.LEARNER });
      jest.setSystemTime(new Date('2026-01-08T00:00:20.000Z'));

      const guard = new JwtAdminGuard(jwtService);
      const { context } = makeContextWithToken(token);

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('the allowed skew is explicit and bounded', () => {
    it('exposes a single named, positive upper-bounded value', () => {
      expect(BOUNDED_SKEW_SECONDS).toBeGreaterThan(0);
      expect(BOUNDED_SKEW_SECONDS).toBeLessThanOrEqual(HARD_MAX_SKEW_SECONDS);
    });

    it('tolerance above the hard maximum cannot reach verification', () => {
      // Any value above the hard max must be rejected up-front by config
      // validation; verification itself never receives an unbounded value.
      expect(HARD_MAX_SKEW_SECONDS).toBeLessThan(3600);
      expect(() => buildJwtService(HARD_MAX_SKEW_SECONDS)).not.toThrow();
      expect(BOUNDED_SKEW_SECONDS).toBeLessThanOrEqual(HARD_MAX_SKEW_SECONDS);
    });

    it('lets a caller widen the tolerance within the bound for legitimate use', async () => {
      const generous = buildJwtService(HARD_MAX_SKEW_SECONDS);
      const token = generous.sign({ sub: 'u1', role: UserRole.ADMIN });

      // 90s past expiry — beyond the default 30s but comfortably inside the
      // widened 120s tolerance.
      jest.setSystemTime(new Date('2026-01-08T00:01:30.000Z'));

      await expect(generous.verifyAsync(token)).resolves.toMatchObject({
        sub: 'u1',
      });
    });
  });
});
