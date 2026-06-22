import { Injectable, Logger } from '@nestjs/common';
import { TransactionBuilder, Contract, nativeToScVal, TimeoutInfinite } from '@stellar/stellar-sdk';

import { JobHandler, Job, CancellationToken } from '../types';
import { RefundJobPayload } from '../types/job-payloads.types';
import { SupabaseService } from '../../supabase/supabase.service';
import { ContractRegistryService } from '../../contracts/contract-registry.service';
import { SorobanRpcService, SOROBAN_ERROR_CODES } from '../../transactions/soroban-rpc.service';
import { StellarSigningService } from '../../common/stellar-signing.service';
import { SorobanErrorCode } from '../../common/soroban-errors';
import { RefundableEntityType, RefundStatus } from '../../refunds/refunds.types';

@Injectable()
export class RefundJobHandler implements JobHandler<RefundJobPayload> {
  private readonly logger = new Logger(RefundJobHandler.name);
  private readonly networkPassphrase: string;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly contractRegistry: ContractRegistryService,
    private readonly sorobanRpc: SorobanRpcService,
    private readonly signingService: StellarSigningService,
  ) {
    this.networkPassphrase = process.env.NETWORK === 'mainnet'
      ? 'Public Global Stellar Network ; September 2015'
      : 'Test SDF Network ; September 2015';
  }

  async execute(job: Job<RefundJobPayload>, cancellationToken: CancellationToken): Promise<void> {
    const { refundId, entityType, entityId } = job.payload;

    cancellationToken.throwIfCancelled();

    this.logger.log(
      `Processing refund job: refundId=${refundId}, entityType=${entityType}, entityId=${entityId}, jobId=${job.id}`,
    );

    const client = this.supabaseService.getClient();

    let existingRecord: {
      on_chain_tx_hash: string | null;
      contract_id: string | null;
      retry_count: number;
      is_retryable: boolean;
    } | null;

    try {
      const { data } = await client
        .from('refund_attempts')
        .select('on_chain_tx_hash, contract_id, retry_count, is_retryable')
        .eq('id', refundId)
        .maybeSingle();

      existingRecord = data;

      if (existingRecord?.on_chain_tx_hash) {
        this.logger.log(
          `Refund ${refundId} already has transaction hash ${existingRecord.on_chain_tx_hash}, checking status...`,
        );

        const txStatus = await this.sorobanRpc.pollTransactionStatus(existingRecord.on_chain_tx_hash);

        if (txStatus.status === 'SUCCESS') {
          await this.updateRefundStatus(refundId, 'confirmed', {
            onChainTxHash: existingRecord.on_chain_tx_hash,
            contractId: existingRecord.contract_id ?? undefined,
          });
          return;
        }

        if (txStatus.status === 'FAILED') {
          throw new Error(`Previous submission failed: ${txStatus.errorMessage ?? 'Unknown error'}`);
        }

        throw new Error('Previous transaction not yet confirmed, job will retry');
      }

      const registry = await this.contractRegistry.getRegistry();
      const contractId = registry.data.RustAcademy?.id;

      if (!contractId) {
        throw new Error('RustAcademy contract not found in registry');
      }

      const entityInfo = await this.getEntityInfo(entityType as RefundableEntityType, entityId);

      cancellationToken.throwIfCancelled();

      const contract = new Contract(contractId);

      const sourceAccount = await this.sorobanRpc.getAccount(this.signingService.publicKey);

      const refundArgs = [
        nativeToScVal(Buffer.from(entityInfo.commitment, 'hex'), { type: 'bytes' }),
        nativeToScVal(this.signingService.publicKey, { type: 'address' }),
      ];

      const txBuilder = new TransactionBuilder(sourceAccount, {
        fee: '100000',
        networkPassphrase: this.networkPassphrase,
      });

      txBuilder.addOperation(contract.call('refund', ...refundArgs));
      txBuilder.setTimeout(TimeoutInfinite);

      const builtTx = txBuilder.build();

      const preparedTx = await this.sorobanRpc.prepareTransaction(builtTx);
      this.signingService.signTransaction(preparedTx, this.networkPassphrase);

      const txHash = preparedTx.hash().toString('hex');

      const result = await this.sorobanRpc.submitAndWait(preparedTx);

      if (result.status === 'SUCCESS') {
        await this.updateRefundStatus(refundId, 'confirmed', {
          onChainTxHash: txHash,
          contractId,
          network: this.networkPassphrase.includes('PUBLIC') ? 'mainnet' : 'testnet',
        });

        this.logger.log(
          `Refund successfully submitted and confirmed: refundId=${refundId}, txHash=${txHash}, jobId=${job.id}`,
        );
        return;
      }

      const failureReason = this.classifyFailure(result);
      const isRetryable = this.isFailureRetryable(failureReason);

      await this.updateRefundStatus(refundId, 'failed', {
        onChainTxHash: txHash,
        contractId,
        failureReason,
        isRetryable,
        network: this.networkPassphrase.includes('PUBLIC') ? 'mainnet' : 'testnet',
      });

      if (!isRetryable) {
        throw new PermanentRefundError(failureReason);
      }

      throw new Error(failureReason);
    } catch (error) {
      if (error instanceof PermanentRefundError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Refund job failed: refundId=${refundId}, jobId=${job.id}, error=${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      if (existingRecord) {
        const txHash = existingRecord.on_chain_tx_hash;
        const contractId = existingRecord.contract_id ?? undefined;
        const failureReason = this.sanitizeFailureReason(errorMessage);

        await this.updateRefundStatus(refundId, 'failed', {
          onChainTxHash: txHash ?? undefined,
          contractId,
          failureReason,
          isRetryable: true,
        });
      }

      throw error;
    }
  }

  async validate(payload: RefundJobPayload): Promise<void> {
    const errors: string[] = [];

    if (!payload.refundId || typeof payload.refundId !== 'string') {
      errors.push('refundId is required and must be a string');
    }

    if (!payload.idempotencyKey || typeof payload.idempotencyKey !== 'string') {
      errors.push('idempotencyKey is required and must be a string');
    }

    if (!payload.entityType || typeof payload.entityType !== 'string') {
      errors.push('entityType is required and must be a string');
    }

    if (!payload.entityId || typeof payload.entityId !== 'string') {
      errors.push('entityId is required and must be a string');
    }

    if (errors.length > 0) {
      throw new PermanentRefundError(`Validation failed: ${errors.join(', ')}`);
    }
  }

  async onFailure(job: Job<RefundJobPayload>, error: Error): Promise<void> {
    const { refundId } = job.payload;

    this.logger.error(
      `Refund permanently failed: refundId=${refundId}, jobId=${job.id}, error=${error.message}`,
    );

    await this.updateRefundStatus(refundId, 'failed', {
      failureReason: error.message,
      isRetryable: false,
    });
  }

  private async getEntityInfo(
    entityType: RefundableEntityType,
    entityId: string,
  ): Promise<{ commitment: string }> {
    const client = this.supabaseService.getClient();

    if (entityType === 'escrow') {
      const { data: escrow } = await client
        .from('escrow_records')
        .select('commitment')
        .eq('id', entityId)
        .maybeSingle();

      if (!escrow?.commitment) {
        throw new Error(`Escrow ${entityId} not found or missing commitment`);
      }

      return { commitment: escrow.commitment };
    }

    if (entityType === 'payment') {
      const { data: payment } = await client
        .from('payment_records')
        .select('commitment')
        .eq('id', entityId)
        .maybeSingle();

      if (!payment?.commitment) {
        throw new Error(`Payment ${entityId} not found or missing commitment`);
      }

      return { commitment: payment.commitment };
    }

    if (entityType === 'link') {
      const { data: link } = await client
        .from('payment_links')
        .select('commitment')
        .eq('id', entityId)
        .maybeSingle();

      if (!link?.commitment) {
        throw new Error(`Link ${entityId} not found or missing commitment`);
      }

      return { commitment: link.commitment };
    }

    throw new Error(`Unknown entity type: ${entityType}`);
  }

  private async updateRefundStatus(
    refundId: string,
    status: RefundStatus,
    options: {
      onChainTxHash?: string;
      contractId?: string;
      failureReason?: string;
      isRetryable?: boolean;
      network?: string;
    } = {},
  ): Promise<void> {
    const client = this.supabaseService.getClient();

    const update: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (options.onChainTxHash) {
      update.on_chain_tx_hash = options.onChainTxHash;
    }

    if (options.contractId) {
      update.contract_id = options.contractId;
    }

    if (options.failureReason) {
      update.failure_reason = options.failureReason;
    }

    if (options.isRetryable !== undefined) {
      update.is_retryable = options.isRetryable;
    }

    if (options.network) {
      update.network = options.network;
    }

    const { error } = await client
      .from('refund_attempts')
      .update(update)
      .eq('id', refundId);

    if (error) {
      this.logger.error(`Failed to update refund status: ${error.message}`);
    }
  }

  private classifyFailure(
    txResult: { status: string; errorCode?: string; errorMessage?: string },
  ): string {
    if (txResult.status === 'FAILED') {
      if (txResult.errorCode === SOROBAN_ERROR_CODES.CONTRACT_ERROR) {
        return txResult.errorMessage ?? SorobanErrorCode.REFUND_FAILED;
      }
      return txResult.errorMessage ?? SorobanErrorCode.UNKNOWN;
    }
    return `${SOROBAN_ERROR_CODES.TX_TIMEOUT}: Transaction not confirmed`;
  }

  private isFailureRetryable(errorMessage: string): boolean {
    const lowerMessage = errorMessage.toLowerCase();

    const permanentPatterns = [
      SorobanErrorCode.ESCROW_ALREADY_SETTLED.toLowerCase(),
      SorobanErrorCode.ESCROW_NOT_EXPIRED.toLowerCase(),
      SorobanErrorCode.INVALID_INPUT.toLowerCase(),
    ];

    for (const pattern of permanentPatterns) {
      if (lowerMessage.includes(pattern)) {
        return false;
      }
    }

    return true;
  }

  private sanitizeFailureReason(message: string): string {
    const dangerousPatterns = [
      /secret/i,
      /private.?key/i,
      /seed/i,
    ];

    let sanitized = message;
    for (const pattern of dangerousPatterns) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }

    return sanitized;
  }
}

export class PermanentRefundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentRefundError';
  }
}