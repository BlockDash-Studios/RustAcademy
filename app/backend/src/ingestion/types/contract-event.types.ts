/**
 * Domain types for  RustAcademy Soroban contract events.
 * These mirror the Rust event structs defined in contracts/ RustAcademy/src/events.rs
 */

export type SorobanEventType =
  | "EscrowDeposited"
  | "EscrowWithdrawn"
  | "EscrowRefunded"
  | "PrivacyToggled"
  | "ContractPaused"
  | "AdminChanged"
  | "ContractUpgraded"
  | "EphemeralKeyRegistered"
  | "StealthWithdrawn";

export interface BaseContractEvent {
  eventType: SorobanEventType;
  /** Schema version read from the event payload (1 = legacy, 2+ = versioned). */
  schemaVersion: number;
  topicNamespace?: string;
  txHash: string;
  ledgerSequence: number;
  pagingToken: string;
  contractTimestamp: bigint;
  /**
   * Ledger sequence reported by the contract itself (from `env.ledger().sequence()`).
   * Present in v2+ events that include the `ledger_sequence` payload field.
   * Backends SHOULD validate this matches the Horizon-reported `ledgerSequence` to
   * detect tampered or mis-routed event payloads. Use together with `txHash` and
   * `pagingToken` as a complete, stable deduplication key for replay safety.
   */
  contractLedgerSequence?: number;
}

export interface EscrowDepositedEvent extends BaseContractEvent {
  eventType: "EscrowDeposited";
  commitment: string; // hex
  owner: string;
  token: string;
  amount: bigint;
  amountPaid?: bigint;
  expiresAt: bigint;
}

export interface EscrowWithdrawnEvent extends BaseContractEvent {
  eventType: "EscrowWithdrawn";
  commitment: string;
  owner: string;
  token: string;
  amount: bigint;
}

export interface EscrowRefundedEvent extends BaseContractEvent {
  eventType: "EscrowRefunded";
  commitment: string;
  owner: string;
  token: string;
  amount: bigint;
}

export interface PrivacyToggledEvent extends BaseContractEvent {
  eventType: "PrivacyToggled";
  owner: string;
  enabled: boolean;
}

export interface ContractPausedEvent extends BaseContractEvent {
  eventType: "ContractPaused";
  admin: string;
  paused: boolean;
}

export interface AdminChangedEvent extends BaseContractEvent {
  eventType: "AdminChanged";
  oldAdmin: string;
  newAdmin: string;
}

export interface ContractUpgradedEvent extends BaseContractEvent {
  eventType: "ContractUpgraded";
  newWasmHash: string;
  admin: string;
}

/** Emitted when a sender registers an ephemeral public key and locks funds for a stealth recipient. */
export interface EphemeralKeyRegisteredEvent extends BaseContractEvent {
  eventType: "EphemeralKeyRegistered";
  /** One-time stealth address (hex). */
  stealthAddress: string;
  /** Sender's ephemeral public key (hex). */
  ephPub: string;
  token: string;
  amount: bigint;
  expiresAt: bigint;
}

/** Emitted when a recipient withdraws funds from a stealth escrow. */
export interface StealthWithdrawnEvent extends BaseContractEvent {
  eventType: "StealthWithdrawn";
  /** One-time stealth address (hex). */
  stealthAddress: string;
  /** Recipient's real address – only revealed at withdrawal time. */
  recipient: string;
  token: string;
  amount: bigint;
}

export type RustAcademyContractEvent =
  | EscrowDepositedEvent
  | EscrowWithdrawnEvent
  | EscrowRefundedEvent
  | PrivacyToggledEvent
  | ContractPausedEvent
  | AdminChangedEvent
  | ContractUpgradedEvent
  | EphemeralKeyRegisteredEvent
  | StealthWithdrawnEvent;

export type EscrowEvent =
  | EscrowDepositedEvent
  | EscrowWithdrawnEvent
  | EscrowRefundedEvent;

export type AdminEvent =
  | ContractPausedEvent
  | AdminChangedEvent
  | ContractUpgradedEvent;

export type StealthEvent = EphemeralKeyRegisteredEvent | StealthWithdrawnEvent;
