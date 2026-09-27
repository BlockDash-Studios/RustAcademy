import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { WalletAuthStore } from './wallet-auth.store';
import { WalletAuthError, WalletAuthFailure } from './wallet-auth.errors';
import { WalletSession } from './wallet-auth.types';

/** Absolute session lifetime. Rotation does not extend it. */
export const DEFAULT_REFRESH_TTL_SECONDS = 60 * 60 * 24 * 14;

/** A refresh token as presented by a client: `<sessionId>.<secret>`. */
const TOKEN_SEPARATOR = '.';

const hashToken = (secret: string): string =>
  createHash('sha256').update(secret).digest('hex');

/** Constant-time comparison so a mismatched hash cannot be probed by timing. */
const hashesMatch = (a: string, b: string): boolean => {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
};

@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly store: WalletAuthStore,
    private readonly ttlSeconds: number = DEFAULT_REFRESH_TTL_SECONDS,
  ) {}

  /** Start a new refresh-token family for a wallet. */
  async issue(
    walletAddress: string,
    now: Date = new Date(),
  ): Promise<{ session: WalletSession; refreshToken: string }> {
    const sessionId = randomUUID();
    const secret = randomBytes(32).toString('hex');

    const session: WalletSession = {
      id: sessionId,
      walletAddress,
      tokenHash: hashToken(secret),
      generation: 0,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.ttlSeconds * 1000),
      lastRotatedAt: now,
    };

    await this.store.saveSession(session);
    return { session, refreshToken: `${sessionId}${TOKEN_SEPARATOR}${secret}` };
  }

  /**
   * Rotate a refresh token.
   *
   * Presenting a token that is not the family's current one means an older
   * token was replayed. That is treated as compromise: the whole family is
   * revoked immediately, so an attacker holding a stolen token and the
   * legitimate client both lose access and the user must re-authenticate.
   */
  async rotate(
    refreshToken: string,
    now: Date = new Date(),
  ): Promise<{ session: WalletSession; refreshToken: string }> {
    const { sessionId, secret } = this.parse(refreshToken);
    const session = await this.store.findSession(sessionId);

    if (!session) {
      throw new WalletAuthError(
        WalletAuthFailure.RefreshTokenNotFound,
        'No session exists for the supplied refresh token',
        { sessionId },
      );
    }

    if (session.revokedAt) {
      throw new WalletAuthError(
        WalletAuthFailure.SessionRevoked,
        'Session has been revoked',
        { sessionId, reason: session.revokedReason, revokedAt: session.revokedAt },
      );
    }

    if (session.expiresAt.getTime() <= now.getTime()) {
      throw new WalletAuthError(
        WalletAuthFailure.RefreshTokenExpired,
        'Refresh token has expired',
        { sessionId, expiresAt: session.expiresAt },
      );
    }

    if (!hashesMatch(session.tokenHash, hashToken(secret))) {
      // A superseded token was presented. Revoke the family before reporting,
      // so the state is already consistent when the caller sees the error.
      await this.revokeSession(session, 'reuse_detected', now);
      throw new WalletAuthError(
        WalletAuthFailure.RefreshTokenReused,
        'Refresh token has already been rotated; session revoked',
        { sessionId, generation: session.generation },
      );
    }

    const nextSecret = randomBytes(32).toString('hex');
    const rotated: WalletSession = {
      ...session,
      tokenHash: hashToken(nextSecret),
      generation: session.generation + 1,
      lastRotatedAt: now,
    };

    await this.store.saveSession(rotated);
    return {
      session: rotated,
      refreshToken: `${sessionId}${TOKEN_SEPARATOR}${nextSecret}`,
    };
  }

  /** Revoke every family belonging to a wallet. Used on logout. */
  async revokeAllForWallet(
    walletAddress: string,
    now: Date = new Date(),
  ): Promise<number> {
    const sessions = await this.store.findSessionsByWallet(walletAddress);
    const active = sessions.filter(session => !session.revokedAt);

    for (const session of active) {
      await this.revokeSession(session, 'logout', now);
    }
    return active.length;
  }

  private async revokeSession(
    session: WalletSession,
    reason: 'logout' | 'reuse_detected',
    now: Date,
  ): Promise<void> {
    await this.store.saveSession({
      ...session,
      revokedAt: now,
      revokedReason: reason,
    });
  }

  private parse(refreshToken: string): { sessionId: string; secret: string } {
    const separator = refreshToken.indexOf(TOKEN_SEPARATOR);
    if (separator <= 0 || separator === refreshToken.length - 1) {
      throw new WalletAuthError(
        WalletAuthFailure.RefreshTokenNotFound,
        'Refresh token is malformed',
      );
    }
    return {
      sessionId: refreshToken.slice(0, separator),
      secret: refreshToken.slice(separator + 1),
    };
  }
}
