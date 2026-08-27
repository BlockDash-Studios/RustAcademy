import {
  ContractRegistryEntry,
  ContractRegistryFilter,
} from '../interfaces/contracts.interface';

/**
 * Repository interface for contract registry storage.
 * Isolates persistence concerns from business logic.
 */
export interface IContractRegistryRepository {
  /**
   * Register a new contract.
   */
  register(entry: ContractRegistryEntry): void;

  /**
   * Get a contract registry entry by contract ID.
   */
  get(contractId: string): ContractRegistryEntry | undefined;

  /**
   * List registry entries, optionally filtered.
   */
  list(filter?: ContractRegistryFilter): ContractRegistryEntry[];

  /**
   * Remove a registry entry by contract ID.
   */
  deregister(contractId: string): boolean;

  /**
   * Check if a contract is already registered.
   */
  has(contractId: string): boolean;

  /**
   * Get the total number of registered contracts.
   */
  count(): number;

  /**
   * Clear all registry data (useful for testing).
   */
  clearAll(): void;
}
