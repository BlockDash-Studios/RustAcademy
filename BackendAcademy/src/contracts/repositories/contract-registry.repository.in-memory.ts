import {
  ContractRegistryEntry,
  ContractRegistryFilter,
} from '../interfaces/contracts.interface';
import { IContractRegistryRepository } from './contract-registry.repository.interface';

/**
 * In-memory implementation of the contract registry repository.
 * Stores contract registry entries in process-local Map.
 */
export class InMemoryContractRegistryRepository implements IContractRegistryRepository {
  private readonly registry = new Map<string, ContractRegistryEntry>();

  register(entry: ContractRegistryEntry): void {
    this.registry.set(entry.contractId, entry);
  }

  get(contractId: string): ContractRegistryEntry | undefined {
    return this.registry.get(contractId);
  }

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

  deregister(contractId: string): boolean {
    return this.registry.delete(contractId);
  }

  has(contractId: string): boolean {
    return this.registry.has(contractId);
  }

  count(): number {
    return this.registry.size;
  }

  clearAll(): void {
    this.registry.clear();
  }
}
