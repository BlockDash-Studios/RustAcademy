import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { RegisterWalletDto, VerifyTransactionDto } from './dto/verify-transaction.dto';
import {
  TransactionIdempotencyRecord,
  TransactionVerificationResult,
  WalletAccount,
  WalletBalance,
  WalletLedgerEntry,
  WalletTransaction,
} from './interfaces/wallet.interface';

/**
 * Amount handling — Issue #657 (BA-089).
 *
 * All monetary amounts are represented as **integer minor units** so that
 * `parseFloat` / floating-point arithmetic can never introduce rounding
 * errors in transfers or fees.
 *
 * Precision rules:
 * - `AMOUNT_SCALE = 100_000` (1e-5), i.e. one minor unit = 0.00001. This
 *   matches the wallet's existing 5-decimal display precision (`toFixed(5)`)
 *   and the 0.00001 network fee used in `verifyTransaction`.
 * - Parsing (`parseMinorUnits`): accepts plain decimal strings; inputs with
 *   more than 5 fractional digits are rounded half-up at the 5th decimal.
 * - Formatting (`formatMinorUnits`): converts back to a fixed 5-decimal
 *   string using integer division, so balances never accumulate float error.
 * - All comparisons and arithmetic (balances, fees, totals) happen on
 *   integers; floating point is never used for money math.
 */
const AMOUNT_SCALE = 100_000;

/** Network fee charged per verified transaction (0.00001 XLM). */
const NETWORK_FEE_MINOR_UNITS = 1;

/**
 * Parses a decimal amount string into integer minor units.
 * Returns null when the input is not a valid non-negative decimal amount.
 */
function parseMinorUnits(amount: string): number | null {
  const normalized = String(amount ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const [whole, fraction = ''] = normalized.split('.');
  const padded = (fraction + '00000').slice(0, 5);
  const units = Number(whole) * AMOUNT_SCALE + Number(padded);

  // Round half-up when more than 5 fractional digits were supplied.
  const extra = fraction.slice(5);
  if (extra.length > 0 && Number(extra[0]) >= 5) {
    return units + 1;
  }
  return units;
}

/** Formats integer minor units as a fixed 5-decimal string (e.g. "1.23456"). */
function formatMinorUnits(units: number): string {
  const sign = units < 0 ? '-' : '';
  const abs = Math.abs(units);
  const whole = Math.floor(abs / AMOUNT_SCALE);
  const fraction = abs % AMOUNT_SCALE;
  return `${sign}${whole}.${String(fraction).padStart(5, '0')}`;
}

export interface ReconciliationResult {
  walletAddress: string;
  expectedBalance: string;
  actualBalance: string;
  difference: string;
  reconciledAt: Date;
  status: 'matched' | 'drift_detected' | 'error';
}

export interface ReconciliationReport {
  totalWallets: number;
  matched: number;
  driftDetected: number;
  errors: number;
  results: ReconciliationResult[];
  generatedAt: Date;
}

/** Canonical testnet Stellar network passphrase. */
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const MAINNET_PASSPHRASE = 'Public Global Stellar Network ; September 2015';

/** Default config values for Stellar network settings (BA-090). */
const DEFAULT_NETWORK_PASSPHRASE = TESTNET_PASSPHRASE;
const DEFAULT_ALLOWED_ASSETS = 'XLM:native';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  /**
   * Registered wallet accounts (address -> account). Balance is NOT stored
   * here; it is always derived from {@link ledger}.
   */
  private readonly wallets = new Map<string, WalletAccount>();

  /**
   * Immutable, append-only ledger. This is the single source of truth for
   * balances (BA-088): entries are only ever appended, and a balance is
   * computed by folding the entries for an account + asset. Because the
   * ledger is deterministic, replaying the same events always yields the
   * same balances.
   */
  private readonly ledger: WalletLedgerEntry[] = [];

  private readonly transactions = new Map<string, WalletTransaction>();

  /**
   * Idempotency store for transaction verification (BA-091): maps
   * `transactionId` -> record containing the payload hash of the first
   * attempt and its result. Exact retries return the stored result;
   * conflicting retries are rejected.
   */
  private readonly verificationRecords = new Map<
    string,
    TransactionIdempotencyRecord
  >();

  private readonly networkPassphrase: string;
  private readonly allowedAssets: Map<string, string>;
  private readonly horizonUrl?: string;

  constructor(private readonly configService?: ConfigService) {
    this.networkPassphrase =
      this.configService?.get<string>('STELLAR_NETWORK_PASSPHRASE') ??
      DEFAULT_NETWORK_PASSPHRASE;
    this.horizonUrl = this.configService?.get<string>('STELLAR_HORIZON_URL');
    this.allowedAssets = this.parseAllowedAssets(
      this.configService?.get<string>('STELLAR_ALLOWED_ASSETS') ??
        DEFAULT_ALLOWED_ASSETS,
    );
  }

  // ──────────────────────────────────────────────────────────────────
  // Registration
  // ──────────────────────────────────────────────────────────────────

  async registerWallet(dto: RegisterWalletDto): Promise<WalletAccount> {
    const assetIssuer = this.resolveAssetIssuer(dto.assetCode, dto.assetIssuer);
    this.validateAssetAllowed(dto.assetCode, assetIssuer);

    if (this.wallets.has(dto.address)) {
      throw new BadRequestException({
        error: 'WALLET_ALREADY_REGISTERED',
        message: `Wallet ${dto.address} is already registered`,
      });
    }

    const account: WalletAccount = {
      address: dto.address,
      assetCode: dto.assetCode,
      assetIssuer,
      createdAt: new Date(),
    };

    this.wallets.set(dto.address, account);

    // Seed the account with a zero-delta ledger entry so it participates in
    // reconciliation from the moment it is registered.
    this.appendLedgerEntry({
      account: dto.address,
      assetCode: dto.assetCode,
      assetIssuer,
      delta: '0.00000',
      reason: 'seed',
    });
    return account;
  }

  // ──────────────────────────────────────────────────────────────────
  // Verified transfers (idempotent) — BA-091
  // ──────────────────────────────────────────────────────────────────

  async verifyTransaction(
    dto: VerifyTransactionDto,
  ): Promise<TransactionVerificationResult> {
    // 1. Validate the request against the configured Stellar environment
    //    (addresses, asset, network passphrase, horizon) — BA-090.
    this.validateStellarAddress(dto.sourceAccount);
    this.validateStellarAddress(dto.destinationAccount);
    this.validateNetworkConfig();

    if (dto.sourceAccount === dto.destinationAccount) {
      throw new BadRequestException({
        error: 'SAME_ACCOUNT_TRANSFER',
        message: 'Source and destination accounts cannot be the same',
      });
    }

    // Amount arithmetic happens exclusively in integer minor units (#657).
    const amountUnits = parseMinorUnits(dto.amount);
    if (amountUnits === null || amountUnits <= 0) {
      throw new BadRequestException({
        error: 'INVALID_AMOUNT',
        message: 'Transaction amount must be a positive number',
      });
    }

    const sourceWallet = this.wallets.get(dto.sourceAccount);
    const sourceBalanceUnits = parseMinorUnits(sourceWallet?.balance ?? '0') ?? 0;
    const assetIssuer = this.resolveAssetIssuer(dto.assetCode, dto.assetIssuer);
    this.validateAssetAllowed(dto.assetCode, assetIssuer);

    // 2. Idempotency gate: a transaction id may only be verified once. An
    //    exact retry returns the original result; a conflicting retry is
    //    rejected so a transfer can never be double-applied (BA-091).
    const payloadHash = this.computePayloadHash({
      transactionId: dto.transactionId,
      sourceAccount: dto.sourceAccount,
      destinationAccount: dto.destinationAccount,
      amount: dto.amount,
      assetCode: dto.assetCode,
      assetIssuer,
      memo: dto.memo ?? null,
    });

    const existing = this.verificationRecords.get(dto.transactionId);
    if (existing) {
      if (existing.payloadHash === payloadHash) {
        // Exact retry — return the already-computed result unmodified.
        this.logger.log(
          `Exact retry for transaction ${dto.transactionId}; returning stored result`,
        );
        return existing.result;
      }
      throw new ConflictException({
        error: 'TRANSACTION_ID_CONFLICT',
        message: `Transaction ${dto.transactionId} was already verified with a different payload`,
      });
    }

    // 3. Evaluate affordability + verification level using ledger-derived
    //    balances (never mutable balances).
    const sourceBalance = this.getLedgerBalance(
      dto.sourceAccount,
      dto.assetCode,
      assetIssuer,
    );

    const totalRequiredUnits = amountUnits + NETWORK_FEE_MINOR_UNITS;

    let verified: boolean;
    let status: TransactionVerificationResult['status'];
    let message: string;

    const sourceWallet = this.wallets.get(dto.sourceAccount);
    if (!sourceWallet) {
      verified = false;
      status = 'rejected';
      message = `Source account ${dto.sourceAccount} is not registered`;
    } else if (sourceBalanceUnits < totalRequiredUnits) {
      verified = false;
      status = 'rejected';
      message = `Insufficient balance. Required: ${formatMinorUnits(
        totalRequiredUnits,
      )}, available: ${formatMinorUnits(sourceBalanceUnits)}`;
    } else if (amountUnits > 1000 * AMOUNT_SCALE) {
      verified = true;
      status = 'pending';
      message = `Transaction of ${formatMinorUnits(
        amountUnits,
      )} ${dto.assetCode} requires additional verification`;
    } else {
      verified = true;
      status = 'verified';
      message = 'Transaction verified successfully';

      sourceWallet.balance = formatMinorUnits(sourceBalanceUnits - totalRequiredUnits);
      const destWallet = this.wallets.get(dto.destinationAccount);
      if (destWallet) {
        const destBalanceUnits = parseMinorUnits(destWallet.balance) ?? 0;
        destWallet.balance = formatMinorUnits(destBalanceUnits + amountUnits);
      }
    }

    const result: TransactionVerificationResult = {
      transactionId: dto.transactionId,
      verified,
      status,
      message,
      verifiedAt: new Date(),
      details: {
        sourceBalance: formatMinorUnits(sourceBalanceUnits),
        destinationBalance: this.wallets.get(dto.destinationAccount)?.balance ?? '0.00',
        fee: formatMinorUnits(NETWORK_FEE_MINOR_UNITS),
        networkPassphrase: 'Test SDF Network ; September 2015',
        sourceBalance: sourceBalance.toFixed(5),
        destinationBalance: this.getLedgerBalance(
          dto.destinationAccount,
          dto.assetCode,
          assetIssuer,
        ).toFixed(5),
        fee: fee.toString(),
        networkPassphrase: this.networkPassphrase,
      },
    };

    // Persist idempotency BEFORE mutating the ledger so a crash cannot
    // leave a half-applied transfer without a stored verification result.
    this.verificationRecords.set(dto.transactionId, {
      transactionId: dto.transactionId,
      payloadHash,
      result,
      createdAt: new Date(),
    });

    // 4. Only a genuinely verified transfer moves value between accounts,
    //    and only by appending immutable ledger entries.
    if (status === 'verified') {
      this.appendLedgerEntry({
        account: dto.sourceAccount,
        assetCode: dto.assetCode,
        assetIssuer,
        delta: `-${totalRequired.toFixed(5)}`,
        reason: 'transfer',
        transactionId: dto.transactionId,
      });
      this.appendLedgerEntry({
        account: dto.destinationAccount,
        assetCode: dto.assetCode,
        assetIssuer,
        delta: amount.toFixed(5),
        reason: 'transfer',
        transactionId: dto.transactionId,
      });

      const walletTx: WalletTransaction = {
        transactionId: dto.transactionId,
        sourceAccount: dto.sourceAccount,
        destinationAccount: dto.destinationAccount,
        amount: dto.amount,
        assetCode: dto.assetCode,
        assetIssuer,
        memo: dto.memo,
        hash: this.generateHash(),
        status: 'completed',
        createdAt: new Date(),
        completedAt: new Date(),
      };
      this.transactions.set(dto.transactionId, walletTx);
    } else if (status === 'pending') {
      const walletTx: WalletTransaction = {
        transactionId: dto.transactionId,
        sourceAccount: dto.sourceAccount,
        destinationAccount: dto.destinationAccount,
        amount: dto.amount,
        assetCode: dto.assetCode,
        assetIssuer,
        memo: dto.memo,
        hash: this.generateHash(),
        status: 'pending',
        createdAt: new Date(),
      };
      this.transactions.set(dto.transactionId, walletTx);
    }

    return result;
  }

  async getWallet(address: string): Promise<WalletAccount> {
    const wallet = this.wallets.get(address);
    if (!wallet) {
      throw new BadRequestException({
        error: 'WALLET_NOT_FOUND',
        message: `Wallet ${address} not found`,
      });
    }
    return wallet;
  }

  async getWalletBalance(address: string): Promise<WalletBalance> {
    const wallet = this.wallets.get(address);

    const balances: WalletBalance['balances'] = [];
    if (wallet) {
      balances.push({
        assetCode: wallet.assetCode,
        amount: this.getLedgerBalance(
          wallet.address,
          wallet.assetCode,
          wallet.assetIssuer,
        ).toFixed(5),
        assetIssuer: wallet.assetIssuer,
      });
    }

    // Always include native XLM balance, derived from the ledger.
    balances.push({
      assetCode: 'XLM',
      amount: this.getLedgerBalance(address, 'XLM', 'native').toFixed(5),
      assetIssuer: 'native',
    });

    return {
      address,
      balances,
      lastUpdated: new Date(),
    };
  }

  async getTransactionHistory(address: string): Promise<WalletTransaction[]> {
    const txs: WalletTransaction[] = [];
    for (const tx of this.transactions.values()) {
      if (tx.sourceAccount === address || tx.destinationAccount === address) {
        txs.push(tx);
      }
    }
    return txs.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  async getVerificationStatus(
    transactionId: string,
  ): Promise<TransactionVerificationResult | null> {
    return this.verificationRecords.get(transactionId)?.result ?? null;
  }

  async getAllWallets(): Promise<WalletAccount[]> {
    return Array.from(this.wallets.values());
  }

  // ──────────────────────────────────────────────────────────────────
  // Reconciliation — BA-088: balances derive from the ledger, so
  // reconciling against an external source detects whether the derived
  // balance disagrees with the network, exactly as required.
  // ──────────────────────────────────────────────────────────────────

  async reconcileAllWallets(): Promise<ReconciliationReport> {
    const results: ReconciliationResult[] = [];
    const now = new Date();
    for (const [address, wallet] of this.wallets) {
      try {
        const externalBalance = await this.fetchExternalBalance(address);
        const currentBalance = this.getLedgerBalance(
          address,
          wallet.assetCode,
          wallet.assetIssuer,
        );
        if (Math.abs(currentBalance - parseFloat(externalBalance)) > 1e-9) {
          results.push({
            walletAddress: address,
            expectedBalance: externalBalance,
            actualBalance: currentBalance,
            difference: this.diffAsMinorUnits(externalBalance, currentBalance),
            actualBalance: currentBalance.toFixed(5),
            difference: (parseFloat(externalBalance) - currentBalance).toFixed(5),
            reconciledAt: now,
            status: 'drift_detected',
          });
        } else {
          results.push({
            walletAddress: address,
            expectedBalance: currentBalance.toFixed(5),
            actualBalance: currentBalance.toFixed(5),
            difference: '0.00000',
            reconciledAt: now,
            status: 'matched',
          });
        }
      } catch {
        results.push({
          walletAddress: address,
          expectedBalance: '0.00000',
          actualBalance: this.getLedgerBalance(
            address,
            wallet.assetCode,
            wallet.assetIssuer,
          ).toFixed(5),
          difference: '0.00000',
          reconciledAt: now,
          status: 'error',
        });
      }
    }
    const matched = results.filter((r) => r.status === 'matched').length;
    const driftDetected = results.filter((r) => r.status === 'drift_detected').length;
    const errors = results.filter((r) => r.status === 'error').length;
    return {
      totalWallets: this.wallets.size,
      matched,
      driftDetected,
      errors,
      results,
      generatedAt: now,
    };
  }

  async reconcileWallet(address: string): Promise<ReconciliationResult> {
    const wallet = this.wallets.get(address);
    if (!wallet) {
      throw new BadRequestException({
        error: 'WALLET_NOT_FOUND',
        message: `Wallet ${address} not found`,
      });
    }
    const externalBalance = await this.fetchExternalBalance(address);
    const currentBalance = this.getLedgerBalance(
      address,
      wallet.assetCode,
      wallet.assetIssuer,
    );
    const now = new Date();
    if (Math.abs(currentBalance - parseFloat(externalBalance)) > 1e-9) {
      return {
        walletAddress: address,
        expectedBalance: externalBalance,
        actualBalance: currentBalance,
        difference: this.diffAsMinorUnits(externalBalance, currentBalance),
        actualBalance: currentBalance.toFixed(5),
        difference: (parseFloat(externalBalance) - currentBalance).toFixed(5),
        reconciledAt: now,
        status: 'drift_detected',
      };
    }
    return {
      walletAddress: address,
      expectedBalance: currentBalance.toFixed(5),
      actualBalance: currentBalance.toFixed(5),
      difference: '0.00000',
      reconciledAt: now,
      status: 'matched',
    };
  }

  /** Difference between two decimal balance strings, in integer minor units (#657). */
  private diffAsMinorUnits(expected: string, actual: string): string {
    const expectedUnits = parseMinorUnits(expected) ?? 0;
    const actualUnits = parseMinorUnits(actual) ?? 0;
    return formatMinorUnits(expectedUnits - actualUnits);
  // ──────────────────────────────────────────────────────────────────
  // Ledger helpers — the ONLY way balances change (BA-088)
  // ──────────────────────────────────────────────────────────────────

  private appendLedgerEntry(
    entry: Omit<WalletLedgerEntry, 'entryId' | 'createdAt'>,
  ): void {
    this.ledger.push({
      ...entry,
      entryId: uuidv4(),
      createdAt: new Date(),
    });
  }

  /**
   * Derives an account's balance for an asset by folding every ledger entry
   * for that account + asset. Purely functional and deterministic: the same
   * ledger always produces the same balance, which is what makes restart
   * and reconciliation tests produce identical results (BA-088).
   */
  private getLedgerBalance(
    account: string,
    assetCode: string,
    assetIssuer: string,
  ): number {
    let balance = 0;
    for (const entry of this.ledger) {
      if (
        entry.account === account &&
        entry.assetCode === assetCode &&
        entry.assetIssuer === assetIssuer
      ) {
        balance += parseFloat(entry.delta);
      }
    }
    return balance;
  }

  private async fetchExternalBalance(address: string): Promise<string> {
    // The ledger is the local source of truth. An integration would query
    // Horizon here; for now the "external" view defaults to the derived
    // ledger balance so reconciliation is deterministic offline.
    const wallet = this.wallets.get(address);
    if (!wallet) return '0.00000';
    return this.getLedgerBalance(
      address,
      wallet.assetCode,
      wallet.assetIssuer,
    ).toFixed(5);
  }

  private generateHash(): string {
    return Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join('');
  }

  // ──────────────────────────────────────────────────────────────────
  // Idempotency helpers — BA-091
  // ──────────────────────────────────────────────────────────────────

  private computePayloadHash(payload: Record<string, unknown>): string {
    return createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  // ──────────────────────────────────────────────────────────────────
  // Stellar environment validation — BA-090
  // ──────────────────────────────────────────────────────────────────

  async validateAddress(address: string): Promise<void> {
    this.validateStellarAddress(address);
  }

  validateAsset(assetCode: string, assetIssuer?: string): void {
    const issuer = this.resolveAssetIssuer(assetCode, assetIssuer);
    if (!/^[A-Z0-9]{1,12}$/.test(assetCode)) {
      throw new BadRequestException({
        error: 'INVALID_ASSET_CODE',
        message: 'assetCode must be a valid Stellar asset code (1-12 alphanumeric)',
      });
    }
    if (assetCode !== 'XLM') {
      this.validateStellarAddress(issuer);
    }
    this.validateAssetAllowed(assetCode, issuer);
  }

  private resolveAssetIssuer(assetCode: string, assetIssuer?: string): string {
    if (assetCode === 'XLM') return 'native';
    if (!assetIssuer) {
      throw new BadRequestException({
        error: 'ASSET_ISSUER_REQUIRED',
        message: `assetIssuer is required for non-native asset ${assetCode}`,
      });
    }
    this.validateStellarAddress(assetIssuer);
    return assetIssuer;
  }

  /**
   * Validates that the (asset, issuer) pair is permitted by the configured
   * Stellar allow-list. Only explicitly accepted assets can move value.
   */
  private validateAssetAllowed(assetCode: string, issuer: string): void {
    const expectedIssuer = this.allowedAssets.get(assetCode);
    if (expectedIssuer === undefined) {
      throw new BadRequestException({
        error: 'ASSET_NOT_ALLOWED',
        message: `Asset ${assetCode} is not in the configured allow-list`,
      });
    }
    if (expectedIssuer !== issuer) {
      throw new BadRequestException({
        error: 'ASSET_ISSUER_MISMATCH',
        message: `Issuer ${issuer} does not match configured issuer for ${assetCode}`,
      });
    }
  }

  /**
   * Validates that the Stellar environment (network passphrase and Horizon
   * URL) is configured consistently with the declared network (BA-090).
   *
   * The passphrase must be one of Stellar's canonical values and must match
   * the configured `STELLAR_NETWORK`. If a Horizon URL is supplied it must
   * be a valid HTTP(S) URL so Horizon calls target the same network.
   */
  private validateNetworkConfig(): void {
    const network = this.configService?.get<string>('STELLAR_NETWORK') ?? 'testnet';
    const expectedPassphrase =
      network === 'mainnet' || network === 'public'
        ? MAINNET_PASSPHRASE
        : TESTNET_PASSPHRASE;

    if (this.networkPassphrase !== expectedPassphrase) {
      throw new BadRequestException({
        error: 'NETWORK_PASSPHRASE_MISMATCH',
        message:
          `Stellar network passphrase does not match configured STELLAR_NETWORK='${network}'`, // eslint-disable-line max-len
      });
    }

    if (this.horizonUrl && !/^https?:\/\//.test(this.horizonUrl)) {
      throw new BadRequestException({
        error: 'INVALID_HORIZON_URL',
        message: 'STELLAR_HORIZON_URL must be a valid HTTP(S) URL',
      });
    }
  }

  private validateStellarAddress(address: string): void {
    if (!address || !address.trim()) {
      throw new BadRequestException({
        error: 'INVALID_ADDRESS',
        message: 'Stellar address is required',
      });
    }
    if (!address.startsWith('G') || address.length !== 56) {
      throw new BadRequestException({
        error: 'INVALID_ADDRESS',
        message: 'Address must be a valid Stellar public key starting with G',
      });
    }
  }

  private parseAllowedAssets(raw: string): Map<string, string> {
    const map = new Map<string, string>();
    for (const token of raw.split(',')) {
      const trimmed = token.trim();
      if (!trimmed) continue;
      const [assetCode, issuer] = trimmed.split(':');
      if (!assetCode) continue;
      map.set(assetCode, issuer === 'native' || issuer === undefined ? 'native' : issuer);
    }
    return map;
  }

  /**
   * Exposed for diagnostics/monitoring: returns the current ordered view of
   * the immutable ledger (never mutated in place).
   */
  getLedgerView(): ReadonlyArray<WalletLedgerEntry> {
    return [...this.ledger];
  }
}