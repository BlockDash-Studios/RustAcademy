import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';

import type { EnvConfig } from '../config/env.schema';

// ─── Typed errors ──────────────────────────────────────────────────────────────

export class SigningNotConfiguredError extends Error {
  constructor() {
    super('Stellar signing key not configured — set STELLAR_SECRET_KEY');
    this.name = 'SigningNotConfiguredError';
  }
}

export class NetworkPassphraseMismatchError extends Error {
  constructor(expected: string, received: string) {
    super(
      `Network passphrase mismatch: signing service configured for "${expected}" ` +
        `but caller requested "${received}". ` +
        'Signing aborted to prevent cross-network transaction submission.',
    );
    this.name = 'NetworkPassphraseMismatchError';
  }
}

// ─── Service ───────────────────────────────────────────────────────────────────

/**
 * Central authority for all Stellar/Soroban transaction signing.
 *
 * Policy:
 *  - Keypair loaded once at startup from STELLAR_SECRET_KEY; raw string discarded.
 *  - Every sign call validates the expected network passphrase against the
 *    passphrase derived from the configured NETWORK, preventing a caller from
 *    accidentally signing a mainnet transaction on a testnet deployment.
 *  - Audit log emitted per sign event (publicKey + txHash, never the secret).
 *  - Throws typed errors so callers can distinguish "not configured" from
 *    "wrong network" without inspecting message strings.
 */
@Injectable()
export class StellarSigningService {
  private readonly logger = new Logger(StellarSigningService.name);
  private readonly keypair: StellarSdk.Keypair | null;
  private readonly networkPassphrase: string;

  constructor(configService: ConfigService<EnvConfig>) {
    const network = configService.get('NETWORK', { infer: true }) ?? 'testnet';
    this.networkPassphrase =
      network === 'mainnet' ? StellarSdk.Networks.PUBLIC : StellarSdk.Networks.TESTNET;

    const secret = configService.get('STELLAR_SECRET_KEY', { infer: true });
    if (secret) {
      this.keypair = StellarSdk.Keypair.fromSecret(secret);
      this.logger.log(
        `Signing key loaded. publicKey=${this.keypair.publicKey()} network=${network}`,
      );
    } else {
      this.keypair = null;
      this.logger.warn('STELLAR_SECRET_KEY not set — signing disabled');
    }
  }

  /** True when a signing key is available. */
  get isConfigured(): boolean {
    return this.keypair !== null;
  }

  /** Public key of the loaded signing keypair. Throws if not configured. */
  get publicKey(): string {
    if (!this.keypair) throw new SigningNotConfiguredError();
    return this.keypair.publicKey();
  }

  /**
   * Sign `tx` in-place after validating `expectedNetworkPassphrase` matches
   * the passphrase this service is configured for.
   *
   * Emits an audit log entry containing the public key and transaction hash.
   * The private key is never logged or included in thrown errors.
   *
   * @throws {SigningNotConfiguredError} when no key is loaded.
   * @throws {NetworkPassphraseMismatchError} when the passphrase doesn't match.
   */
  signTransaction(
    tx: StellarSdk.Transaction,
    expectedNetworkPassphrase: string,
  ): void {
    if (!this.keypair) throw new SigningNotConfiguredError();

    if (expectedNetworkPassphrase !== this.networkPassphrase) {
      throw new NetworkPassphraseMismatchError(
        this.networkPassphrase,
        expectedNetworkPassphrase,
      );
    }

    const txHash = tx.hash().toString('hex');
    tx.sign(this.keypair);

    this.logger.log(
      JSON.stringify({
        action: 'stellar_sign',
        publicKey: this.keypair.publicKey(),
        txHash,
      }),
    );
  }
}
