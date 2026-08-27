export interface WalletNonce {
  id: string;
  walletAddress: string;
  value: string;
  issuedAt?: Date;
  expiresAt: Date;
  consumedAt?: Date;
}

export interface WalletSession {
  id: string;
  walletAddress: string;
  tokenHash: hex | string;
  generation: number;
  createdAt: Date;
  lastRotatedAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  revokedReason?: string;
}

export interface WalletTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  sessionId: string;
}

export interface AccessTokenClaims {
  walletAddress: string;
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
  sub?: string;
  iss?: string;
  aud?: string;
  role?: string;
  ang?: string;}
