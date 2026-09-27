/**
 * Explicit failure codes for the wallet authentication flow.
 *
 * Every rejection path carries its own code so callers can distinguish a
 * replayed nonce from an expired one, and a rotated refresh token from a
 * revoked family. Acceptance criterion 2 of #549 requires these paths to be
 * surfaced rather than collapsed into a single "unauthorized".
 */
export enum WalletAuthFailure {
  /** No nonce exists for the supplied challenge id. */
  NonceNotFound = 'nonce_not_found',
  /** The nonce exists but its time-to-live has elapsed. */
  NonceExpired = 'nonce_expired',
  /** The nonce was already consumed — a replay attempt. */
  NonceAlreadyUsed = 'nonce_already_used',
  /** The nonce was issued to a different wallet than the one presenting it. */
  NonceWalletMismatch = 'nonce_wallet_mismatch',
  /** The signature does not verify against the wallet's public key. */
  SignatureInvalid = 'signature_invalid',
  /** The supplied wallet address is not a valid Stellar public key. */
  WalletAddressInvalid = 'wallet_address_invalid',
  /** No session exists for the supplied refresh token. */
  RefreshTokenNotFound = 'refresh_token_not_found',
  /** The refresh token is past its absolute expiry. */
  RefreshTokenExpired = 'refresh_token_expired',
  /** The refresh token was already rotated — the family is now revoked. */
  RefreshTokenReused = 'refresh_token_reused',
  /** The session was explicitly revoked, by logout or by reuse detection. */
  SessionRevoked = 'session_revoked',
}

/**
 * Error raised by the wallet auth services.
 *
 * Carries a machine-readable `failure` alongside the message so guards,
 * metrics and audit entries can branch on the cause without string matching.
 */
export class WalletAuthError extends Error {
  constructor(
    readonly failure: WalletAuthFailure,
    message: string,
    readonly metadata: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'WalletAuthError';
  }

  /** Failures that indicate an attack rather than an ordinary expiry. */
  get isSuspicious(): boolean {
    return (
      this.failure === WalletAuthFailure.NonceAlreadyUsed ||
      this.failure === WalletAuthFailure.RefreshTokenReused ||
      this.failure === WalletAuthFailure.NonceWalletMismatch
    );
  }
}
