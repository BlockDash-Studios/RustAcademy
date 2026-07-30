import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { isFeatureEnabled } from '../config/env.schema';
import {
  ContractRegistryEntry,
  ContractRegistryValidationResult,
  ContractSchemaDefinition,
  ContractRegistryFilter,
} from './interfaces/contracts.interface';

/**
 * Validates and manages contract registry entries with schema
 * compatibility checks.
 *
 * Addresses issue #393: contract registry entries must not be accepted
 * without validating required fields, version expectations, and
 * schema compatibility against the configured contract schema version.
 */
@Injectable()
export class ContractRegistryService implements OnModuleInit {
  private readonly logger = new Logger(ContractRegistryService.name);
  private readonly registry = new Map<string, ContractRegistryEntry>();
  private readonly schemaRequired: boolean;

  constructor(private readonly configService: ConfigService) {
    this.schemaRequired = isFeatureEnabled(
      this.configService.get<string>('CONTRACT_REGISTRY_REQUIRE_SCHEMA'),
    );
  }

  onModuleInit(): void {
    this.logger.log(
      `ContractRegistryService initialized (schemaRequired=${this.schemaRequired})`,
    );
  }

  /**
   * Registers a new contract after performing schema compatibility
   * validation. Throws BadRequestException if validation fails.
   */
  async register(
    entry: Omit<ContractRegistryEntry, 'id' | 'registeredAt' | 'validatedAt' | 'validationStatus'>,
  ): Promise<ContractRegistryEntry> {
    // ── Required field validation ──────────────────────────────────
    this.validateRequiredFields(entry);

    // ── Schema compatibility validation ───────────────────────────
    const validationResult = this.validateSchemaCompatibility(entry);

    if (!validationResult.valid) {
      if (this.schemaRequired) {
        throw new BadRequestException({
          error: 'CONTRACT_SCHEMA_INCOMPATIBLE',
          message: 'Contract registry entry failed schema compatibility checks',
          details: validationResult.errors,
        });
      }
      this.logger.warn(
        `Contract "${entry.contractId}" has schema compatibility issues: ${validationResult.errors.join('; ')}`,
      );
    }

    // ── Duplicate check ───────────────────────────────────────────
    if (this.registry.has(entry.contractId)) {
      throw new BadRequestException({
        error: 'CONTRACT_ALREADY_REGISTERED',
        message: `Contract "${entry.contractId}" is already registered`,
      });
    }

    // ── Max entries check ─────────────────────────────────────────
    const maxEntries = this.configService.get<number>(
      'CONTRACT_REGISTRY_MAX_ENTRIES',
      1000,
    );
    if (this.registry.size >= maxEntries) {
      throw new BadRequestException({
        error: 'REGISTRY_FULL',
        message: `Contract registry has reached maximum capacity of ${maxEntries} entries`,
      });
    }

    const now = new Date();
    const registered: ContractRegistryEntry = {
      ...entry,
      id: uuidv4(),
      registeredAt: now,
      validatedAt: now,
      validationStatus: validationResult.valid ? 'valid' : 'warning',
    };

    this.registry.set(entry.contractId, registered);
    this.logger.log(
      `Contract "${entry.contractId}" registered (status=${registered.validationStatus})`,
    );

    return registered;
  }

  /**
   * Returns a contract registry entry by contract ID.
   */
  get(contractId: string): ContractRegistryEntry | undefined {
    return this.registry.get(contractId);
  }

  /**
   * Lists registry entries, optionally filtered.
   */
  list(filter?: ContractRegistryFilter): ContractRegistryEntry[] {
    let entries = Array.from(this.registry.values());

    if (filter?.network) {
      entries = entries.filter((e) => e.network === filter.network);
    }
    if (filter?.validationStatus) {
      entries = entries.filter((e) => e.validationStatus === filter.validationStatus);
    }
    if (filter?.deployedBy) {
      entries = entries.filter((e) => e.deployedBy === filter.deployedBy);
    }

    return entries;
  }

  /**
   * Removes a registry entry by contract ID.
   */
  deregister(contractId: string): boolean {
    return this.registry.delete(contractId);
  }

  /**
   * Returns the total number of registered contracts.
   */
  get count(): number {
    return this.registry.size;
  }

  // ── Private validation helpers ──────────────────────────────────

  /**
   * Validates that all required fields are present and well-formed.
   */
  private validateRequiredFields(
    entry: Omit<ContractRegistryEntry, 'id' | 'registeredAt' | 'validatedAt' | 'validationStatus'>,
  ): void {
    const errors: string[] = [];

    if (!entry.contractId?.trim()) {
      errors.push('contractId is required and must be non-empty');
    } else if (!/^C[A-Z0-9]{32,}$/.test(entry.contractId)) {
      errors.push(
        'contractId must start with "C" followed by at least 32 alphanumeric characters',
      );
    }

    if (!entry.wasmHash?.trim()) {
      errors.push('wasmHash is required and must be non-empty');
    } else if (!/^[a-fA-F0-9]{64}$/.test(entry.wasmHash)) {
      errors.push('wasmHash must be a 64-character hex string');
    }

    if (!entry.network) {
      errors.push('network is required');
    } else if (!['testnet', 'futurenet', 'mainnet'].includes(entry.network)) {
      errors.push(
        `network must be one of "testnet", "futurenet", or "mainnet", got "${entry.network}"`,
      );
    }

    if (!entry.deployedBy?.trim()) {
      errors.push('deployedBy is required');
    } else if (!entry.deployedBy.startsWith('G') || entry.deployedBy.length !== 56) {
      errors.push(
        'deployedBy must be a valid Stellar public key (starts with G, 56 characters)',
      );
    }

    if (entry.version !== undefined) {
      if (typeof entry.version !== 'number' || entry.version < 1) {
        errors.push('version must be a positive integer >= 1');
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        error: 'CONTRACT_REGISTRY_VALIDATION_FAILED',
        message: 'Required field validation failed',
        details: errors,
      });
    }
  }

  /**
   * Validates schema compatibility of a contract registry entry against
   * the configured contract schema version.
   */
  private validateSchemaCompatibility(
    entry: Omit<ContractRegistryEntry, 'id' | 'registeredAt' | 'validatedAt' | 'validationStatus'>,
  ): ContractRegistryValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const requiredVersion = this.configService.get<string>(
      'CONTRACT_SCHEMA_VERSION',
      '1.0.0',
    );

    // ── Schema field validation ──────────────────────────────────
    if (!entry.schema) {
      errors.push('schema is required for schema compatibility validation');
      return { valid: false, errors };
    }

    const schema = entry.schema;

    // Version compatibility
    if (!schema.version) {
      errors.push('schema.version is required');
    } else if (!this.isVersionCompatible(schema.version, requiredVersion)) {
      errors.push(
        `schema.version "${schema.version}" is incompatible with required version "${requiredVersion}"`,
      );
    }

    // Required schema fields
    if (!schema.contractType || !schema.contractType.trim()) {
      errors.push('schema.contractType is required');
    }

    if (!Array.isArray(schema.entryPoints) || schema.entryPoints.length === 0) {
      errors.push('schema.entryPoints must be a non-empty array');
    }

    // Method signature validation
    if (Array.isArray(schema.methods)) {
      for (const method of schema.methods) {
        if (!method.name?.trim()) {
          errors.push(`schema.methods contains a method with missing name`);
        }
        if (!Array.isArray(method.args)) {
          errors.push(
            `schema.methods.${method.name}: args must be an array`,
          );
        }
      }
    }

    // Network compatibility check
    if (entry.network === 'mainnet') {
      if (!schema.isMainnetCompatible) {
        warnings.push(
          'Contract registered on mainnet but schema does not declare mainnet compatibility',
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Checks whether a schema version string is compatible with the
   * required version. Compatible means same major version and
   * minor version >= required.
   */
  private isVersionCompatible(
    version: string,
    required: string,
  ): boolean {
    const parse = (v: string): [number, number, number] => {
      const parts = v.split('.').map(Number);
      return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
    };

    const [vMajor, vMinor] = parse(version);
    const [rMajor, rMinor] = parse(required);

    if (vMajor !== rMajor) return false;
    if (vMinor < rMinor) return false;
    return true;
  }
}
