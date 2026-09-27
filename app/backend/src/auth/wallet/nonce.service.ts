import { Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { WalletAuthStore } from './wallet-auth.store';
import { WalletAuthError, WalletAuthFailure } from './wallet-auth.errors';
import { WalletNonce } from './wallet-auth.types';

/** Default challenge lifetime. Short enough to bound replay, long enough for a
 *  human to approve a signature in a wallet UI. */
export const DEFAULT_NONCE_TTL_SECONDS = 300;

@Injectable()
export class NonceService {
  constructor(
    private readonly store: WalletAuthStore,
    private readonly ttlSeconds: number = DEFAULT_NONCE_TTL_SECONDS,
  ) {}

  /**
   * Issue a single-use challenge bound to one wallet address.
   *
   * The nonce is bound at issue time so that a challenge obtained for wallet A
   * cannot be signed by wallet B — the binding is checked on consumption and
   * reported as its own failure code.
   */
  async issue(walletAddress: string, now: Date = new Date()): Promise<WalletNonce> {
    const nonce: WalletNonce = {
      id: randomUUID(),
      value: randomBytes(32).toString('hex'),
      walletAddress,
      issuedAt: now,
      expiresAt: new Date(now.getTime() + this.ttlSeconds * 1000),
    };

    await this.store.saveNonce(nonce);
    return nonce;
  }

  /**
   * Consume a nonce, marking it used.
   *
   * Ordering matters. Existence, expiry, replay and wallet binding are checked
   * before anything is written, so a rejected attempt leaves the nonce exactly
   * as it was. A replay therefore keeps reporting `NonceAlreadyUsed` rather
   * than mutating state into some third condition.
   */
  async consume(
    nonceId: string,
    walletAddress: string,
    now: Date = new Date(),
  ): Promise<WalletNonce> {
    const nonce = await this.store.findNonce(nonceId);

    if (!nonce) {
      throw new WalletAuthError(
        WalletAuthFailure.NonceNotFound,
        'No challenge exists for the supplied id',
        { nonceId },
      );
    }

    if (nonce.consumedAt) {
      throw new WalletAuthError(
        WalletAuthFailure.NonceAlreadyUsed,
        'Challenge has already been used',
        { nonceId, walletAddress: nonce.walletAddress, consumedAt: nonce.consumedAt },
      );
    }

    if (nonce.expiresAt.getTime() <= now.getTime()) {
      throw new WalletAuthError(
        WalletAuthFailure.NonceExpired,
        'Challenge has expired',
        { nonceId, expiresAt: nonce.expiresAt },
      );
    }

    if (nonce.walletAddress !== walletAddress) {
      throw new WalletAuthError(
        WalletAuthFailure.NonceWalletMismatch,
        'Challenge was issued to a different wallet',
        { nonceId, issuedTo: nonce.walletAddress, presentedBy: walletAddress },
      );
    }

    const consumed: WalletNonce = { ...nonce, consumedAt: now };
    await this.store.saveNonce(consumed);
    return consumed;
  }
}
