import { HttpException, HttpStatus } from '@nestjs/common';
import { ContractCompatibilityMetadata } from '../dto/contract-compatibility.dto';

/**
 * Error codes for contract compatibility validation failures.
 */
export enum ContractCompatibilityErrorCode {
  /** Client's contract version is too low for the endpoint */
  CONTRACT_VERSION_TOO_LOW = 'CONTRACT_VERSION_TOO_LOW',
  /** Client's contract version is too high (server not upgraded yet) */
  CONTRACT_VERSION_TOO_HIGH = 'CONTRACT_VERSION_TOO_HIGH',
  /** Contract version mismatch (generic) */
  CONTRACT_VERSION_MISMATCH = 'CONTRACT_VERSION_MISMATCH',
  /** Contract not found in registry */
  CONTRACT_NOT_FOUND = 'CONTRACT_NOT_FOUND',
  /** Contract not deployed on this network */
  CONTRACT_NOT_DEPLOYED = 'CONTRACT_NOT_DEPLOYED',
  /** Contract version is unsupported for this endpoint */
  CONTRACT_VERSION_UNSUPPORTED = 'CONTRACT_VERSION_UNSUPPORTED',
  /** Contract version is deprecated but still functional */
  CONTRACT_VERSION_DEPRECATED = 'CONTRACT_VERSION_DEPRECATED',
  /** Schema version mismatch between client and server */
  SCHEMA_VERSION_MISMATCH = 'SCHEMA_VERSION_MISMATCH',
  /** Invalid contract requirements provided */
  INVALID_CONTRACT_REQUIREMENTS = 'INVALID_CONTRACT_REQUIREMENTS',
}

/**
 * Exception thrown when contract compatibility validation fails.
 * Includes detailed metadata about the incompatibility.
 */
export class ContractCompatibilityError extends HttpException {
  constructor(
    public readonly code: ContractCompatibilityErrorCode,
    message: string,
    public readonly compatibilityMetadata?: ContractCompatibilityMetadata,
    cause?: Error,
  ) {
    const responseBody = {
      success: false,
      error: {
        code,
        message,
        details: compatibilityMetadata ? {
          compatibility: compatibilityMetadata,
          recommendation: compatibilityMetadata.compatible
            ? { message: 'All contracts are compatible', action: 'proceed' as const }
            : {
                message: 'Client upgrade required to continue',
                action: 'upgrade_required' as const,
              },
        } : undefined,
      },
    };

    super(responseBody, HttpStatus.CONFLICT, { cause });
  }
}

/**
 * Exception thrown when client provides invalid contract requirements.
 */
export class InvalidContractRequirementsError extends HttpException {
  constructor(message: string, cause?: Error) {
    const responseBody = {
      success: false,
      error: {
        code: ContractCompatibilityErrorCode.INVALID_CONTRACT_REQUIREMENTS,
        message,
      },
    };
    super(responseBody, HttpStatus.BAD_REQUEST, { cause });
  }
}

/**
 * Warning class for deprecated but still functional contract versions.
 * This is not an exception, but can be used to add warnings to responses.
 */
export class ContractDeprecationWarning {
  constructor(
    public readonly code: ContractCompatibilityErrorCode.CONTRACT_VERSION_DEPRECATED,
    public readonly message: string,
    public readonly deprecationDeadline?: string,
    public readonly upgradeGuideUrl?: string,
  ) {}

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      deprecationDeadline: this.deprecationDeadline,
      upgradeGuideUrl: this.upgradeGuideUrl,
    };
  }
}