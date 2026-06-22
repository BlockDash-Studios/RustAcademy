import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import { AppConfigService } from '../config';
import { AuditService } from '../audit/audit.service';
import { FeatureFlagsService } from './feature-flags.service';
import {
  CONTRACT_WRITES_DISABLED_CODE,
  CONTRACT_WRITES_DISABLED_MESSAGE,
  TESTNET_CONTRACT_WRITES_FLAG,
} from './contract-write-kill-switch.constants';

export interface ContractWritePolicyContext {
  userId?: string;
  operation: string;
  contractId?: string;
  contractName?: string;
  network?: string;
  additionalContext?: Record<string, unknown>;
}

export interface ContractWritePolicyResult {
  allowed: boolean;
  reason: string;
  flagKey?: string;
  decision: 'allowed' | 'blocked';
}

/**
 * Shared service for enforcing contract write safety policies across all backend write paths.
 *
 * This service centralizes policy checks for operations that can submit, deploy, upgrade,
 * or mutate contract state. It ensures consistent enforcement of network safety gates
 * and provides comprehensive audit logging for all contract write operations.
 */
@Injectable()
export class ContractWritePolicyService {
  private readonly logger = new Logger(ContractWritePolicyService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly flags: FeatureFlagsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Check if a contract write operation is allowed based on network safety policies.
   *
   * @param context - Policy context including operation details and actor information
   * @returns Policy decision with reason
   * @throws ServiceUnavailableException if operation is blocked
   */
  async checkWritePermission(
    context: ContractWritePolicyContext,
  ): Promise<ContractWritePolicyResult> {
    const { userId, operation, contractId, contractName, network, additionalContext } =
      context;
    const effectiveNetwork = network ?? this.config.network;
    const actorId = userId ?? 'anonymous';

    // Determine the appropriate flag based on network
    const flagKey = this.config.isTestnet
      ? TESTNET_CONTRACT_WRITES_FLAG
      : 'mainnet.contract_writes';

    // Use fresh flag evaluation for testnet to ensure kill switch takes effect immediately
    const result = this.config.isTestnet
      ? await this.flags.evaluateFlagFresh(flagKey, { userId })
      : await this.flags.evaluateFlag(flagKey, { userId });

    const allowed = result.enabled;
    const decision: 'allowed' | 'blocked' = allowed ? 'allowed' : 'blocked';

    // Audit the decision
    await this.audit.log(
      actorId,
      'contract_write_policy.decision',
      operation,
      {
        decision,
        reason: result.reason,
        flag: flagKey,
        network: effectiveNetwork,
        contractId,
        contractName,
        ...additionalContext,
      },
    );

    if (allowed) {
      this.logger.log(
        `Contract write allowed: ${operation} ` +
          `(network=${effectiveNetwork}, flag=${flagKey}, reason=${result.reason})`,
      );
      return {
        allowed: true,
        reason: result.reason,
        flagKey,
        decision,
      };
    }

    // Log blocked attempt
    this.logger.warn(
      `Contract write blocked: ${operation} ` +
        `(network=${effectiveNetwork}, flag=${flagKey}, reason=${result.reason})`,
    );

    return {
      allowed: false,
      reason: result.reason,
      flagKey,
      decision,
    };
  }

  /**
   * Assert that a contract write operation is allowed, throwing an exception if not.
   *
   * @param context - Policy context including operation details and actor information
   * @throws ServiceUnavailableException if operation is blocked
   */
  async assertWritePermission(context: ContractWritePolicyContext): Promise<void> {
    const result = await this.checkWritePermission(context);

    if (!result.allowed) {
      throw new ServiceUnavailableException({
        code: CONTRACT_WRITES_DISABLED_CODE,
        error: CONTRACT_WRITES_DISABLED_CODE,
        flag: result.flagKey,
        reason: result.reason,
        message: CONTRACT_WRITES_DISABLED_MESSAGE,
      });
    }
  }

  /**
   * Check if a contract write operation is allowed without throwing an exception.
   *
   * @param context - Policy context including operation details and actor information
   * @returns true if allowed, false otherwise
   */
  async isWriteAllowed(context: ContractWritePolicyContext): Promise<boolean> {
    const result = await this.checkWritePermission(context);
    return result.allowed;
  }
}
