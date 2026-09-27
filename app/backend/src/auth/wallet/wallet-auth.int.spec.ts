import { Keypair } from '@stellar/stellar-sdk';
import { AuditService } from '../../audit/audit.service';
import { NonceService } from './nonce.service';
import { RefreshTokenService } from './refresh-token.service';
import { WalletAuthStore } from './wallet-auth.store';
import {
  AuthMetricsSink,
  WALLET_AUTH_ACTIONS,
  WalletAuthService,
  generateAccessTokenSecret,
} from './wallet-auth.service';
import { WalletAuthError, WalletAuthFailure } from './wallet-auth.errors';

/**
 * Integration coverage for the wallet auth flow.
 *
 * The services are wired together for real — nonce issuance, signature
 * verification with an actual Stellar keypair, refresh rotation and the audit
 * service. Only Supabase is substituted, via a client whose calls fail, which
 * also exercises the store's documented graceful degradation.
 */

/** A Supabase stand-in that always fails, proving auth survives an outage. */
const unavailableSupabase = {
  getClient: () => {
    throw new Error('supabase unavailable in tests');
  },
} as never;

class RecordingMetrics implements AuthMetricsSink {
  readonly errors: Array<{ service: string; errorType: string }> = [];
  recordError(service: string, errorType: string): void {
    this.errors.push({ service, errorType });
  }
}

interface Harness {
  service: WalletAuthService;
  audit: AuditService;
  metrics: RecordingMetrics;
  store: WalletAuthStore;
  keypair: Keypair;
  wallet: string;
  auditEntries: () => Promise<Array<{ action: string; metadata?: Record<string, unknown> }>>;
}

function harness(nonceTtlSeconds = 300): Harness {
  const store = new WalletAuthStore(unavailableSupabase);
  const audit = new AuditService(unavailableSupabase);
  const metrics = new RecordingMetrics();
  const nonces = new NonceService(store, nonceTtlSeconds);
  const refreshTokens = new RefreshTokenService(store);
  const service = new WalletAuthService(
    nonces,
    refreshTokens,
    store,
    audit,
    generateAccessTokenSecret(),
    900,
    metrics,
  );

  const keypair = Keypair.random();

  return {
    service,
    audit,
    metrics,
    store,
    keypair,
    wallet: keypair.publicKey(),
    auditEntries: async () => {
      const result = await audit.query({} as never);
      return (Array.isArray(result) ? result : (result as { data?: unknown[] }).data ?? []) as never;
    },
  };
}

const signChallenge = (keypair: Keypair, nonceValue: string): string =>
  keypair.sign(Buffer.from(nonceValue, 'utf8')).toString('base64');

async function loginOnce(h: Harness) {
  const nonce = await h.service.createChallenge(h.wallet, 'req-1');
  return h.service.login(h.wallet, nonce.id, signChallenge(h.keypair, nonce.value), 'req-1');
}

describe('wallet auth integration', () => {
  describe('login', () => {
    it('exchanges a signed challenge for a token pair', async () => {
      const h = harness();
      const tokens = await loginOnce(h);

      expect(tokens.accessToken).toEqual(expect.any(String));
      expect(tokens.refreshToken).toContain('.');
      expect(tokens.expiresIn).toBe(900);

      const claims = h.service.verifyAccessToken(tokens.accessToken);
      expect(claims.walletAddress).toBe(h.wallet);
      expect(claims.sessionId).toBe(tokens.sessionId);
    });

    it('rejects a replayed challenge as a distinct failure', async () => {
      const h = harness();
      const nonce = await h.service.createChallenge(h.wallet);
      const signature = signChallenge(h.keypair, nonce.value);

      await h.service.login(h.wallet, nonce.id, signature);

      await expect(h.service.login(h.wallet, nonce.id, signature)).rejects.toMatchObject({
        failure: WalletAuthFailure.NonceAlreadyUsed,
      });
    });

    it('rejects a challenge presented by a different wallet', async () => {
      const h = harness();
      const other = Keypair.random();
      const nonce = await h.service.createChallenge(h.wallet);

      await expect(
        h.service.login(other.publicKey(), nonce.id, signChallenge(other, nonce.value)),
      ).rejects.toMatchObject({ failure: WalletAuthFailure.NonceWalletMismatch });
    });

    it('rejects an expired challenge', async () => {
      const h = harness(-1); // already expired on issue
      const nonce = await h.service.createChallenge(h.wallet);

      await expect(
        h.service.login(h.wallet, nonce.id, signChallenge(h.keypair, nonce.value)),
      ).rejects.toMatchObject({ failure: WalletAuthFailure.NonceExpired });
    });

    it('rejects a signature from the wrong key', async () => {
      const h = harness();
      const impostor = Keypair.random();
      const nonce = await h.service.createChallenge(h.wallet);

      await expect(
        h.service.login(h.wallet, nonce.id, signChallenge(impostor, nonce.value)),
      ).rejects.toMatchObject({ failure: WalletAuthFailure.SignatureInvalid });
    });

    it('rejects a malformed wallet address', async () => {
      const h = harness();
      await expect(h.service.createChallenge('not-a-stellar-key')).rejects.toMatchObject({
        failure: WalletAuthFailure.WalletAddressInvalid,
      });
    });

    it('leaves the nonce consumed but issues no session when the signature fails', async () => {
      const h = harness();
      const impostor = Keypair.random();
      const nonce = await h.service.createChallenge(h.wallet);

      await expect(
        h.service.login(h.wallet, nonce.id, signChallenge(impostor, nonce.value)),
      ).rejects.toBeInstanceOf(WalletAuthError);

      // The nonce is spent, and no session was created for the wallet.
      const stored = await h.store.findNonce(nonce.id);
      expect(stored?.consumedAt).toBeDefined();
      expect(await h.store.findSessionsByWallet(h.wallet)).toHaveLength(0);
    });
  });

  describe('refresh rotation', () => {
    it('issues a new refresh token on every use', async () => {
      const h = harness();
      const first = await loginOnce(h);
      const second = await h.service.refresh(first.refreshToken);

      expect(second.refreshToken).not.toBe(first.refreshToken);
      expect(second.sessionId).toBe(first.sessionId);
    });

    it('revokes the whole family when a superseded token is replayed', async () => {
      const h = harness();
      const first = await loginOnce(h);
      const second = await h.service.refresh(first.refreshToken);

      // Replaying the original token is treated as compromise.
      await expect(h.service.refresh(first.refreshToken)).rejects.toMatchObject({
        failure: WalletAuthFailure.RefreshTokenReused,
      });

      // The token the legitimate client holds is now dead too.
      await expect(h.service.refresh(second.refreshToken)).rejects.toMatchObject({
        failure: WalletAuthFailure.SessionRevoked,
      });

      const session = await h.store.findSession(first.sessionId);
      expect(session?.revokedReason).toBe('reuse_detected');
    });

    it('increments the generation counter across rotations', async () => {
      const h = harness();
      const first = await loginOnce(h);
      await h.service.refresh(first.refreshToken);

      const session = await h.store.findSession(first.sessionId);
      expect(session?.generation).toBe(1);
    });

    it('rejects an unknown refresh token', async () => {
      const h = harness();
      await expect(h.service.refresh('missing.secret')).rejects.toMatchObject({
        failure: WalletAuthFailure.RefreshTokenNotFound,
      });
    });
  });

  describe('logout', () => {
    it('revokes every active session for the wallet', async () => {
      const h = harness();
      const first = await loginOnce(h);
      const second = await loginOnce(h);

      const revoked = await h.service.logout(h.wallet);
      expect(revoked).toBe(2);

      await expect(h.service.refresh(first.refreshToken)).rejects.toMatchObject({
        failure: WalletAuthFailure.SessionRevoked,
      });
      await expect(h.service.refresh(second.refreshToken)).rejects.toMatchObject({
        failure: WalletAuthFailure.SessionRevoked,
      });
    });
  });

  describe('audit and metrics', () => {
    it('emits structured audit metadata for a successful login', async () => {
      const h = harness();
      const tokens = await loginOnce(h);
      const entries = await h.auditEntries();

      const issued = entries.find(e => e.action === WALLET_AUTH_ACTIONS.challengeIssued);
      const success = entries.find(e => e.action === WALLET_AUTH_ACTIONS.loginSucceeded);

      expect(issued).toBeDefined();
      expect(success).toBeDefined();
      expect(success?.metadata).toMatchObject({ generation: 0 });
      expect(tokens.sessionId).toEqual(expect.any(String));
    });

    it('flags suspicious failures in audit metadata', async () => {
      const h = harness();
      const nonce = await h.service.createChallenge(h.wallet);
      const signature = signChallenge(h.keypair, nonce.value);
      await h.service.login(h.wallet, nonce.id, signature);

      await expect(h.service.login(h.wallet, nonce.id, signature)).rejects.toBeInstanceOf(
        WalletAuthError,
      );

      const entries = await h.auditEntries();
      const failure = entries.find(
        e =>
          e.action === WALLET_AUTH_ACTIONS.loginFailed &&
          e.metadata?.failure === WalletAuthFailure.NonceAlreadyUsed,
      );

      expect(failure).toBeDefined();
      expect(failure?.metadata).toMatchObject({ suspicious: true });
    });

    it('records a metric for each failure type', async () => {
      const h = harness();
      const impostor = Keypair.random();
      const nonce = await h.service.createChallenge(h.wallet);

      await expect(
        h.service.login(h.wallet, nonce.id, signChallenge(impostor, nonce.value)),
      ).rejects.toBeInstanceOf(WalletAuthError);

      expect(h.metrics.errors).toContainEqual({
        service: 'wallet-auth',
        errorType: WalletAuthFailure.SignatureInvalid,
      });
    });

    it('keeps authenticating when the audit store is unavailable', async () => {
      // The harness's Supabase stand-in throws on every call; login still works.
      const h = harness();
      await expect(loginOnce(h)).resolves.toMatchObject({ expiresIn: 900 });
    });
  });

  describe('access tokens', () => {
    it('rejects a tampered access token', async () => {
      const h = harness();
      const tokens = await loginOnce(h);
      const tampered = `${tokens.accessToken.slice(0, -2)}00`;

      expect(() => h.service.verifyAccessToken(tampered)).toThrow(WalletAuthError);
    });

    it('rejects an expired access token', async () => {
      const h = harness();
      const tokens = await loginOnce(h);
      const later = new Date(Date.now() + 901_000);

      expect(() => h.service.verifyAccessToken(tokens.accessToken, later)).toThrow(
        WalletAuthError,
      );
    });
  });
});
