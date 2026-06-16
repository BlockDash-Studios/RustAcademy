// src/transactions/soroban-rpc.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as StellarSdk from "@stellar/stellar-sdk";
import { rpc as SorobanRpc } from "@stellar/stellar-sdk";
import { MetricsService } from "../metrics/metrics.service";

export type TxStatus = "PENDING" | "SUCCESS" | "FAILED" | "NOT_FOUND";

export interface TxResult {
  status: TxStatus;
  hash: string;
  /** Raw ledger-close response when status is SUCCESS */
  response?: SorobanRpc.Api.GetSuccessfulTransactionResponse;
  /** Mapped API error code when status is FAILED */
  errorCode?: string;
  errorMessage?: string;
}

/** Stable API codes callers can depend on */
export const SOROBAN_ERROR_CODES = {
  SIMULATION_FAILED: "SOROBAN_SIMULATION_FAILED",
  SUBMIT_FAILED: "SOROBAN_SUBMIT_FAILED",
  TX_TIMEOUT: "SOROBAN_TX_TIMEOUT",
  DUPLICATE_SUBMISSION: "SOROBAN_DUPLICATE_SUBMISSION",
  CONTRACT_ERROR: "SOROBAN_CONTRACT_ERROR",
  RPC_UNAVAILABLE: "SOROBAN_RPC_UNAVAILABLE",
} as const;

@Injectable()
export class SorobanRpcService {
  private readonly logger = new Logger(SorobanRpcService.name);
  private readonly rpcUrls: string[];
  private readonly requestTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly pollIntervalMs: number;
  private readonly pollTimeoutMs: number;
  private activeIndex = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {
    const configuredUrls =
      this.configService.get<string[]>("stellar.sorobanRpcUrls") ?? [];
    const primaryUrl =
      this.configService.get<string>("stellar.sorobanRpcUrl") ??
      "https://soroban-testnet.stellar.org";
    this.rpcUrls = Array.from(new Set([primaryUrl, ...configuredUrls]));

    this.requestTimeoutMs = Number(
      this.configService.get<string>("SOROBAN_RPC_TIMEOUT_MS") ?? 10_000,
    );
    this.maxRetries = Math.max(
      1,
      Number(this.configService.get<string>("SOROBAN_RPC_MAX_RETRIES") ?? 3),
    );
    this.pollIntervalMs = Number(
      this.configService.get<string>("SOROBAN_POLL_INTERVAL_MS") ?? 2_000,
    );
    this.pollTimeoutMs = Number(
      this.configService.get<string>("SOROBAN_POLL_TIMEOUT_MS") ?? 30_000,
    );

    this.metricsService.setSorobanRpcActiveEndpoint(
      this.rpcUrls[this.activeIndex],
      this.rpcUrls,
    );
    this.logger.log(
      `Soroban RPC initialized with ${this.rpcUrls.length} endpoint(s). Active: ${this.rpcUrls[this.activeIndex]}`,
    );
  }

  // ─── Internal helpers ────────────────────────────────────────────────────

  private createServer(url: string): SorobanRpc.Server {
    return new SorobanRpc.Server(url, { allowHttp: false });
  }

  private getActiveUrl(): string {
    return this.rpcUrls[this.activeIndex];
  }

  private rotateEndpoint(reason: string): void {
    if (this.rpcUrls.length <= 1) return;
    const previous = this.getActiveUrl();
    this.activeIndex = (this.activeIndex + 1) % this.rpcUrls.length;
    const next = this.getActiveUrl();
    this.metricsService.recordSorobanRpcFailover(previous, next, reason);
    this.metricsService.setSorobanRpcActiveEndpoint(next, this.rpcUrls);
    this.logger.warn(`Soroban RPC failover: ${previous} -> ${next} (${reason})`);
  }

  private isTransientError(error: unknown): boolean {
    const message = String((error as Error)?.message ?? error).toLowerCase();
    return (
      message.includes("timeout") ||
      message.includes("network") ||
      message.includes("fetch") ||
      message.includes("econn") ||
      message.includes("429") ||
      message.includes("503") ||
      message.includes("502") ||
      message.includes("500")
    );
  }

  private async withTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeout = setTimeout(() => {
        reject(
          new Error(
            `Soroban RPC ${operation} timed out after ${this.requestTimeoutMs}ms`,
          ),
        );
      }, this.requestTimeoutMs);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private async executeWithFailover<T>(
    operation: string,
    call: (server: SorobanRpc.Server) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      const url = this.getActiveUrl();
      const startedAt = Date.now();
      try {
        const server = this.createServer(url);
        const result = await this.withTimeout(call(server), operation);
        this.metricsService.recordExternalCall(
          "soroban_rpc",
          `${operation}:${url}`,
          (Date.now() - startedAt) / 1000,
        );
        return result;
      } catch (error) {
        lastError = error;
        this.metricsService.recordError(
          "soroban_rpc",
          this.isTransientError(error) ? "transient" : "non_transient",
        );
        if (!this.isTransientError(error) || attempt >= this.maxRetries) {
          break;
        }
        const backoffMs = Math.min(
          250 * 2 ** (attempt - 1) + Math.floor(Math.random() * 200),
          3000,
        );
        this.rotateEndpoint((error as Error).message ?? "transient-error");
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`Soroban RPC ${operation} failed`);
  }

  // ─── Existing methods ────────────────────────────────────────────────────

  async getAccount(publicKey: string): Promise<StellarSdk.Account> {
    try {
      return await this.executeWithFailover("getAccount", (server) =>
        server.getAccount(publicKey),
      );
    } catch {
      throw new Error(`account "${publicKey}" does not exist on the network`);
    }
  }

  async simulateTransaction(
    tx: StellarSdk.Transaction,
  ): Promise<SorobanRpc.Api.SimulateTransactionResponse> {
    return this.executeWithFailover("simulateTransaction", (server) =>
      server.simulateTransaction(tx),
    );
  }

  async getNetworkPassphrase(): Promise<string> {
    const network = await this.executeWithFailover("getNetwork", (server) =>
      server.getNetwork(),
    );
    return network.passphrase;
  }

  // ─── Lifecycle: prepare ──────────────────────────────────────────────────

  /**
   * Simulate a transaction and assemble the authorised, fee-bumped XDR ready
   * for submission.  Throws with SOROBAN_SIMULATION_FAILED on failure.
   */
  async prepareTransaction(
    tx: StellarSdk.Transaction,
  ): Promise<StellarSdk.Transaction> {
    const simResult = await this.simulateTransaction(tx);

    if (SorobanRpc.Api.isSimulationError(simResult)) {
      const err = new Error(
        `${SOROBAN_ERROR_CODES.SIMULATION_FAILED}: ${simResult.error}`,
      );
      (err as Error & { code: string }).code =
        SOROBAN_ERROR_CODES.SIMULATION_FAILED;
      throw err;
    }

    if (SorobanRpc.Api.isSimulationRestore(simResult)) {
      // Footprint restoration required — surface as a known error so callers
      // can handle the restore flow before re-trying.
      const err = new Error(
        `${SOROBAN_ERROR_CODES.SIMULATION_FAILED}: footprint restore required`,
      );
      (err as Error & { code: string; restorePreamble: unknown }).code =
        SOROBAN_ERROR_CODES.SIMULATION_FAILED;
      (err as Error & { code: string; restorePreamble: unknown }).restorePreamble =
        simResult.restorePreamble;
      throw err;
    }

    return SorobanRpc.assembleTransaction(tx, simResult).build();
  }

  // ─── Lifecycle: submit ───────────────────────────────────────────────────

  /**
   * Submit a signed XDR transaction to the network.
   * Returns the transaction hash on acceptance.  Throws with
   * SOROBAN_SUBMIT_FAILED or SOROBAN_DUPLICATE_SUBMISSION on error.
   */
  async submitTransaction(
    signedTx: StellarSdk.Transaction,
  ): Promise<string> {
    const hash = signedTx.hash().toString("hex");

    let sendResult: SorobanRpc.Api.SendTransactionResponse;
    try {
      sendResult = await this.executeWithFailover("sendTransaction", (server) =>
        server.sendTransaction(signedTx),
      );
    } catch (error) {
      const err = new Error(
        `${SOROBAN_ERROR_CODES.SUBMIT_FAILED}: ${(error as Error).message}`,
      );
      (err as Error & { code: string }).code = SOROBAN_ERROR_CODES.SUBMIT_FAILED;
      throw err;
    }

    if (sendResult.status === "ERROR") {
      const detail = sendResult.errorResult?.result().switch().name ?? "unknown";
      if (detail === "txBAD_SEQ") {
        const err = new Error(
          `${SOROBAN_ERROR_CODES.DUPLICATE_SUBMISSION}: sequence conflict`,
        );
        (err as Error & { code: string }).code =
          SOROBAN_ERROR_CODES.DUPLICATE_SUBMISSION;
        throw err;
      }
      const err = new Error(
        `${SOROBAN_ERROR_CODES.SUBMIT_FAILED}: ${detail}`,
      );
      (err as Error & { code: string }).code = SOROBAN_ERROR_CODES.SUBMIT_FAILED;
      throw err;
    }

    this.logger.debug(`Transaction submitted, hash=${hash}`);
    return hash;
  }

  // ─── Lifecycle: poll ─────────────────────────────────────────────────────

  /**
   * Poll for the ledger-close status of a previously submitted transaction.
   * Resolves with a stable TxResult once the transaction is finalised or the
   * poll timeout is reached.
   */
  async pollTransactionStatus(hash: string): Promise<TxResult> {
    const deadline = Date.now() + this.pollTimeoutMs;

    while (Date.now() < deadline) {
      const response = await this.executeWithFailover(
        "getTransaction",
        (server) => server.getTransaction(hash),
      );

      if (response.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
        this.logger.debug(`Transaction ${hash} SUCCESS`);
        return {
          status: "SUCCESS",
          hash,
          response: response as SorobanRpc.Api.GetSuccessfulTransactionResponse,
        };
      }

      if (response.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
        const resultXdr =
          (response as SorobanRpc.Api.GetFailedTransactionResponse)
            .resultXdr?.toXDR("base64") ?? "";
        this.logger.warn(`Transaction ${hash} FAILED result=${resultXdr}`);
        return {
          status: "FAILED",
          hash,
          errorCode: SOROBAN_ERROR_CODES.CONTRACT_ERROR,
          errorMessage: resultXdr,
        };
      }

      // NOT_FOUND or still PENDING — wait and retry
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }

    this.logger.warn(`Transaction ${hash} timed out after ${this.pollTimeoutMs}ms`);
    return {
      status: "FAILED",
      hash,
      errorCode: SOROBAN_ERROR_CODES.TX_TIMEOUT,
      errorMessage: `Transaction not finalised within ${this.pollTimeoutMs}ms`,
    };
  }

  // ─── Lifecycle: combined submit + poll ───────────────────────────────────

  /**
   * Submit a signed transaction and poll until finalised.
   * This is the primary entry point for backend callers that need a stable
   * pending/success/failed result model.
   */
  async submitAndWait(signedTx: StellarSdk.Transaction): Promise<TxResult> {
    const hash = await this.submitTransaction(signedTx);
    return this.pollTransactionStatus(hash);
  }
}