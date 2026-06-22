import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';

import type { EnvConfig } from '../config/env.schema';
import {
  StellarSigningService,
  SigningNotConfiguredError,
  NetworkPassphraseMismatchError,
} from './stellar-signing.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    NETWORK: 'testnet',
    ...overrides,
  };
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService<EnvConfig>;
}

function makeTestnet(): StellarSdk.Networks {
  return StellarSdk.Networks.TESTNET;
}

function makeMainnet(): StellarSdk.Networks {
  return StellarSdk.Networks.PUBLIC;
}

/** Build a minimal real Transaction for signing tests. */
function buildRealTx(
  keypair: StellarSdk.Keypair,
  networkPassphrase: string,
): StellarSdk.Transaction {
  const account = new StellarSdk.Account(keypair.publicKey(), '100');
  return new StellarSdk.TransactionBuilder(account, {
    fee: '100',
    networkPassphrase,
  })
    .addOperation(
      StellarSdk.Operation.payment({
        destination: keypair.publicKey(),
        asset: StellarSdk.Asset.native(),
        amount: '1',
      }),
    )
    .setTimeout(30)
    .build();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('StellarSigningService', () => {
  let testKeypair: StellarSdk.Keypair;

  beforeEach(() => {
    testKeypair = StellarSdk.Keypair.random();
  });

  describe('when signing key is configured', () => {
    it('reports isConfigured = true', () => {
      const service = new StellarSigningService(
        makeConfig({ STELLAR_SECRET_KEY: testKeypair.secret() }),
      );
      expect(service.isConfigured).toBe(true);
    });

    it('publicKey returns the matching G address', () => {
      const service = new StellarSigningService(
        makeConfig({ STELLAR_SECRET_KEY: testKeypair.secret() }),
      );
      expect(service.publicKey).toBe(testKeypair.publicKey());
    });

    it('publicKey never contains the raw secret key', () => {
      const service = new StellarSigningService(
        makeConfig({ STELLAR_SECRET_KEY: testKeypair.secret() }),
      );
      expect(service.publicKey).not.toContain(testKeypair.secret());
    });

    it('signs a testnet transaction successfully', () => {
      const service = new StellarSigningService(
        makeConfig({ NETWORK: 'testnet', STELLAR_SECRET_KEY: testKeypair.secret() }),
      );
      const tx = buildRealTx(testKeypair, makeTestnet());

      expect(() => service.signTransaction(tx, makeTestnet())).not.toThrow();
      expect(tx.signatures.length).toBeGreaterThan(0);
    });

    it('signs a mainnet transaction when NETWORK=mainnet', () => {
      const service = new StellarSigningService(
        makeConfig({ NETWORK: 'mainnet', STELLAR_SECRET_KEY: testKeypair.secret() }),
      );
      const tx = buildRealTx(testKeypair, makeMainnet());

      expect(() => service.signTransaction(tx, makeMainnet())).not.toThrow();
      expect(tx.signatures.length).toBeGreaterThan(0);
    });

    it('throws NetworkPassphraseMismatchError when caller passes wrong network', () => {
      const service = new StellarSigningService(
        makeConfig({ NETWORK: 'testnet', STELLAR_SECRET_KEY: testKeypair.secret() }),
      );
      const tx = buildRealTx(testKeypair, makeTestnet());

      expect(() => service.signTransaction(tx, makeMainnet())).toThrow(
        NetworkPassphraseMismatchError,
      );
    });

    it('throws NetworkPassphraseMismatchError when server=mainnet but caller requests testnet', () => {
      const service = new StellarSigningService(
        makeConfig({ NETWORK: 'mainnet', STELLAR_SECRET_KEY: testKeypair.secret() }),
      );
      const tx = buildRealTx(testKeypair, makeMainnet());

      expect(() => service.signTransaction(tx, makeTestnet())).toThrow(
        NetworkPassphraseMismatchError,
      );
    });

    it('NetworkPassphraseMismatchError message does not contain the secret key', () => {
      const service = new StellarSigningService(
        makeConfig({ NETWORK: 'testnet', STELLAR_SECRET_KEY: testKeypair.secret() }),
      );
      const tx = buildRealTx(testKeypair, makeTestnet());
      let caughtError: Error | undefined;

      try {
        service.signTransaction(tx, makeMainnet());
      } catch (e) {
        caughtError = e as Error;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError!.message).not.toContain(testKeypair.secret());
    });
  });

  describe('when no signing key is configured', () => {
    let service: StellarSigningService;

    beforeEach(() => {
      service = new StellarSigningService(makeConfig({ STELLAR_SECRET_KEY: undefined }));
    });

    it('reports isConfigured = false', () => {
      expect(service.isConfigured).toBe(false);
    });

    it('publicKey getter throws SigningNotConfiguredError', () => {
      expect(() => service.publicKey).toThrow(SigningNotConfiguredError);
    });

    it('signTransaction throws SigningNotConfiguredError', () => {
      const dummyKeypair = StellarSdk.Keypair.random();
      const tx = buildRealTx(dummyKeypair, makeTestnet());

      expect(() => service.signTransaction(tx, makeTestnet())).toThrow(
        SigningNotConfiguredError,
      );
    });

    it('SigningNotConfiguredError message does not contain secret material', () => {
      let caughtError: Error | undefined;
      try {
        service.publicKey;
      } catch (e) {
        caughtError = e as Error;
      }
      expect(caughtError).toBeDefined();
      // Should not contain any S-prefixed base58 key material
      expect(caughtError!.message).not.toMatch(/S[A-Z0-9]{55}/);
    });
  });
});
