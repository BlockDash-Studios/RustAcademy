/** A challenge issued to a wallet, to be signed and returned. */
export interface WalletNonce {
  /** Opaque identifier the client echoes back with the signature. */
  id: string;
  /** The random value the wallet must sign. */
  value: string;
  /** Stellar public key this challenge was issued to. */
  walletAddress: string;
  issuedAt: Date;
  expiresAt: Date;
  /** Set the moment the nonce is consumed; a second use is a replay. */
  consumedAt?: Date;
}

/**
 * A refresh-token family.
 *
 * Rotation replaces `tokenHash` on every use while keeping the same `id`, so
 * presenting a superseded token identifies the family and lets the whole
 * session be revoked.
 */
export interface WalletSession {
  /** Stable family identifier, unchanged across rotations. */
  id: string;
  walletAddress: string;
  /** SHA-256 of the currently valid refresh token. Never the token itself. */
  tokenHash: string;
  /** Incremented on every rotation; useful for audit trails. */
  generation: number;
  createdAt: Date;
  /** Absolute expiry — rotation does not extend it. */
  expiresAt: Date;
  lastRotatedAt: Date;
  revokedAt?: Date;
  revokedReason?: 'logout' | 'reuse_detected';
}

/** Tokens handed back to the client after login or refresh. */
export interface WalletTokenPair {
  accessToken: string;
  refreshToken: string;
  /** Access-token lifetime in seconds. */
  expiresIn: number;
  sessionId: string;
}

/** Verified claims carried by an access token. */
export interface AccessTokenClaims {
  walletAddress: string;
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
}
