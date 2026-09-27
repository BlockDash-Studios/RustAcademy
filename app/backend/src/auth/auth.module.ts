import { Module } from '@nestjs/common';
import { ApiKeyGuard } from './guards/api-key.guard';
import { CustomThrottlerGuard } from './guards/custom-throttler.guard';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { AuditModule } from '../audit/audit.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { AppConfigModule } from '../config/config.module';
import { MetricsModule } from '../metrics/metrics.module';
import { AppConfigService } from '../config/app-config.service';
import { AuditService } from '../audit/audit.service';
import { SupabaseService } from '../supabase/supabase.service';
import { MetricsService } from '../metrics/metrics.service';
import { WalletAuthStore } from './wallet/wallet-auth.store';
import { NonceService } from './wallet/nonce.service';
import { RefreshTokenService } from './wallet/refresh-token.service';
import { WalletAuthService } from './wallet/wallet-auth.service';

/**
 * Wallet auth services take their tuning values as constructor arguments rather
 * than reading config internally, which keeps them trivially constructible in
 * tests. The factories below are the single place configuration is bound.
 */
@Module({
  imports: [
    ApiKeysModule,
    AuditModule,
    SupabaseModule,
    AppConfigModule,
    MetricsModule,
  ],
  providers: [
    ApiKeyGuard,
    CustomThrottlerGuard,
    {
      provide: WalletAuthStore,
      useFactory: (supabase: SupabaseService) => new WalletAuthStore(supabase),
      inject: [SupabaseService],
    },
    {
      provide: NonceService,
      useFactory: (store: WalletAuthStore, config: AppConfigService) =>
        new NonceService(store, config.walletAuthNonceTtlSeconds),
      inject: [WalletAuthStore, AppConfigService],
    },
    {
      provide: RefreshTokenService,
      useFactory: (store: WalletAuthStore, config: AppConfigService) =>
        new RefreshTokenService(store, config.walletAuthRefreshTtlSeconds),
      inject: [WalletAuthStore, AppConfigService],
    },
    {
      provide: WalletAuthService,
      useFactory: (
        nonces: NonceService,
        refreshTokens: RefreshTokenService,
        store: WalletAuthStore,
        audit: AuditService,
        config: AppConfigService,
        metrics: MetricsService,
      ) =>
        new WalletAuthService(
          nonces,
          refreshTokens,
          store,
          audit,
          config.walletAuthAccessTokenSecret,
          config.walletAuthAccessTtlSeconds,
          metrics,
        ),
      inject: [
        NonceService,
        RefreshTokenService,
        WalletAuthStore,
        AuditService,
        AppConfigService,
        MetricsService,
      ],
    },
  ],
  exports: [
    ApiKeyGuard,
    CustomThrottlerGuard,
    WalletAuthService,
    NonceService,
    RefreshTokenService,
  ],
})
export class AuthModule {}
