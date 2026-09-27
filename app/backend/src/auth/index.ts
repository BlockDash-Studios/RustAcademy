export { AuthModule } from './auth.module';
export { ApiKeyGuard } from './guards/api-key.guard';
export { CustomThrottlerGuard } from './guards/custom-throttler.guard';

// Wallet authentication (#549)
export { WalletAuthService, WALLET_AUTH_ACTIONS } from './wallet/wallet-auth.service';
export { NonceService } from './wallet/nonce.service';
export { RefreshTokenService } from './wallet/refresh-token.service';
export { WalletAuthStore } from './wallet/wallet-auth.store';
export { WalletAuthError, WalletAuthFailure } from './wallet/wallet-auth.errors';
export type {
  AccessTokenClaims,
  WalletNonce,
  WalletSession,
  WalletTokenPair,
} from './wallet/wallet-auth.types';
