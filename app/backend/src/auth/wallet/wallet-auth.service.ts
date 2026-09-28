import { Injectable, Logger } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { AuditService } from '../../audit/audit.service';
import { WalletAuthStore } from './wallet-auth.store';
import { NonceService } from './nonce.service';
import { RefreshTokenService } from './refresh-token.service';
import { WalletAuthError, WalletAuthFailure } from './wallet-auth.errors';
import { AccessTokenClaims, WalletNonce, WalletTokenPair } from './wallet-auth.types';

export const DEFAULT_ACCESS_TTL_SECONDS = 900;

export function generateAccessTokenSecret(): string {
  return randomBytes(32).toString('hex');
}

export const WALLET_AUTH_ACTIONS = {
  challengeIssued: 'wallet_auth.challenge_issued',
  loginSucceeded: 'wallet_auth.login_succeeded',
  loginFailed: 'wallet_auth.login_failed',
  refreshSucceeded: 'wallet_auth.refresh_succeeded',
  refreshFailed: 'wallet_auth.refresh_failed',
  logout: 'wallet_auth.logout',
} as const;

export interface AuthMetricsSink {
  recordError(service: string, errorType: string): void;
}

@Injectable()
export class WalletAuthService {
  private readonly logger = new Logger(WalletAuthService.name);

  constructor(
    private readonly nonces: NonceService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly store: WalletAuthStore,
    private readonly audit: AuditService,
    private readonly accessTokenSecret: string,
    private readonly accessTokenTtlSeconds: number = DEFAULT_ACCESS_TTL_SECONDS,
    private readonly metrics?: AuthMetricsSink,
  ) {}

  async createChallenge(
    walletAddress: string,
    requestId?: string,
  ): Promise<WalletNonce> {
    this.assertValidWallet(walletAddress, requestId);

    const nonce = await this.nonces.issue(walletAddress);
    await this.audit.log(
      walletAddress,
      WALLET_AUTH_ACTIONS.challengeIssued,
      nonce.id,
      { expiresAt: nonce.expiresAt.toISOString() },
      requestId,
    );
    return nonce;
  }

  async login(
    walletAddress: string,
    nonceId: string,
    signatureBase64: string,
    requestId?: string,
  ): Promise<WalletTokenPair> {
    this.assertValidWallet(walletAddress, requestId);

    let nonce: WalletNonce;
    try {
      nonce = await this.nonces.consume(nonceId, walletAddress);
    } catch (error) {
      await this.recordFailure(error, walletAddress, WALLET_AUTH_ACTIONS.loginFailed, requestId);
      throw error;
    }

    if (!this.verifySignature(walletAddress, nonce.value, signatureBase64)) {
      const error = new WalletAuthError(
        WalletAuthFailure.SignatureInvalid,
        'Signature does not verify against the wallet address',
        { nonceId },
      );
      await this.recordFailure(error, walletAddress, WALLET_AUTH_ACTIONS.loginFailed, requestId);
      throw error;
    }

    const { session, refreshToken } = await this.refreshTokens.issue(walletAddress);
    const accessToken = this.signAccessToken(walletAddress, session.id);

    await this.audit.log(
      walletAddress,
      WALLET_AUTH_ACTIONS.loginSucceeded,
      session.id,
      { nonceId, generation: session.generation },
      requestId,
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTokenTtlSeconds,
      sessionId: session.id,
    };
  }

  async refresh(refreshToken: string, requestId?: string): Promise<WalletTokenPair> {
    let rotated;
    try {
      rotated = await this.refreshTokens.rotate(refreshToken);
    } catch (error) {
      await this.recordFailure(error, 'unknown', WALLET_AUTH_ACTIONS.refreshFailed, requestId);
      throw error;
    }

    const { session, refreshToken: nextToken } = rotated;
    const accessToken = this.signAccessToken(session.walletAddress, session.id);

    await this.audit.log(
      session.walletAddress,
      WALLET_AUTH_ACTIONS.refreshSucceeded,
      session.id,
      { generation: session.generation },
      requestId,
    );

    return {
      accessToken,
      refreshToken: nextToken,
      expiresIn: this.accessTokenTtlSeconds,
      sessionId: session.id,
    };
  }

  async logout(walletAddress: string, requestId?: string): Promise<number> {
    const revoked = await this.refreshTokens.revokeAllForWallet(walletAddress);
    await this.audit.log(
      walletAddress,
      WALLET_AUTH_ACTIONS.logout,
      undefined,
      { sessionsRevoked: revoked },
      requestId,
    );
    return revoked;
  }

  verifyAccessToken(token: string, now: Date = new Date()): AccessTokenClaims {
    const separator = token.lastIndexOf('.');
    if (separator <= 0) {
      throw new WalletAuthError(
        WalletAuthFailure.SessionRevoked,
        'Access token is malformed',
      );
    }

    const payload = token.slice(0, separator);
    const signature = token.slice(separator + 1);
    const expected = this.hmac(payload);

    const provided = Buffer.from(signature, 'hex');
    const computed = Buffer.from(expected, 'hex');
    if (provided.length !== computed.length || !timingSafeEqual(provided, computed)) {
      throw new WalletAuthError(
        WalletAuthFailure.SignatureInvalid,
        'Access token signature is invalid',
      );
    }

    const rawClaims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;

    if ((rawClaims.expiresAt as number) * 1000 <= now.getTime()) {
      throw new WalletAuthError(
        WalletAuthFailure.RefreshTokenExpired,
        'Access token has expired',
        { sessionId: rawClaims.sessionId },
      );
    }

    if (rawClaims.alg && rawClaims.alg !== 'HS256') {
      throw new WalletAuthError(
        WalletAuthFailure.SignatureInvalid,
        'Algorithm mismatch or disallowed algorithm',
      );
    }

    if (rawClaims.iss && rawClaims.iss !== 'rustacademy-api') {
      throw new WalletAuthError(
        WalletAuthFailure.SignatureInvalid,
        'Invalid token issuer (iss)',
      );
    }

    if (rawClaims.aud && rawClaims.aud !== 'rustacademy-client') {
      throw new WalletAuthError(
        WalletAuthFailure.SignatureInvalid,
        'Invalid token audience (aud)',
      );
    }

    return rawClaims as unknown as AccessTokenClaims;
  }

  private assertValidWallet(walletAddress: string, requestId?: string): void {
    if (!StrKey.isValidEd25519PublicKey(walletAddress)) {
      const error = new WalletAuthError(
        WalletAuthFailure.WalletAddressInvalid,
        'Wallet address is not a valid Stellar public key',
        { walletAddress },
      );
      this.metrics?.recordError('wallet-auth', error.failure);
      void this.audit.log(
        walletAddress,
        WALLET_AUTH_ACTIONS.loginFailed,
        undefined,
        { failure: error.failure },
        requestId,
      );
      throw error;
    }
  }

  private verifySignature(
    walletAddress: string,
    nonceValue: string,
    signatureBase64: string,
  ): boolean {
    try {
      const keypair = Keypair.fromPublicKey(walletAddress);
      return keypair.verify(
        Buffer.from(nonceValue, 'utf8'),
        Buffer.from(signatureBase64, 'base64'),
      );
    } catch (error) {
      this.logger.debug(`Signature verification threw: ${(error as Error).message}`);
      return false;
    }
  }

  private signAccessToken(walletAddress: string, sessionId: string): string {
    const issuedAt = Math.floor(Date.now() / 1000);
    const claims = {
      walletAddress,
      sessionId,
      issuedAt,
      expiresAt: issuedAt + this.accessTokenTtlSeconds,
      sub: walletAddress,
      iss: 'rustacademy-api',
      aud: 'rustacademy-client',
      role: 'authenticated',
      alg: 'HS256',
    };
    const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
    return `${payload}.${this.hmac(payload)}`;
  }

  private hmac(payload: string): string {
    return createHmac('sha256', this.accessTokenSecret).update(payload).digest('hex');
  }

  private async recordFailure(
    error: unknown,
    actor: string,
    action: string,
    requestId?: string,
  ): Promise<void> {
    if (!(error instanceof WalletAuthError)) return;

    const errDetails =
      (error as { details?: unknown; context?: unknown }).details ||
      (error as { details?: unknown; context?: unknown }).context;

    const isSuspicious =
      (error as { isSuspicious?: boolean }).isSuspicious ??
      [
        WalletAuthFailure.NonceAlreadyUsed,
        WalletAuthFailure.SessionRevoked,
        WalletAuthFailure.SignatureInvalid,
      ].includes(error.failure);

    this.metrics?.recordError("wallet-auth", error.failure);
    await this.audit.log(
      actor,
      action,
      undefined,
      {
        failure: error.failure,
        suspicious: isSuspicious,
        ...(errDetails ? { details: errDetails } : {}),
      },
      requestId,
    );
  }
}
