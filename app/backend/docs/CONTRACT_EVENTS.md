# Contract Event Reference for Indexers

This document provides the canonical reference for all events emitted by the Folder contract (`app/contract/contracts/Folder`), including stable event type IDs, topic namespaces, and payload schemas.

## Overview

All v2+ events follow a standardized schema with:
- **Stable numeric event type IDs** (`event_type_id`) that never change across releases
- **Domain-based topic namespaces** (`TOPIC_ADMIN`, `TOPIC_ESCROW`, etc.) for filtering
- **Mandatory replay fields** for deduplication and cross-validation
- **Alphabetically sorted payload keys** for deterministic parsing

## Event Schema Version

**Current version:** `EVENT_SCHEMA_VERSION = 2`

All events include `schema_version: u32` in the payload. Indexers **must** check this field before parsing to route to the correct decoder.

## Topic Namespaces

Events are grouped by domain using `topics[0]`:

| Constant | Value | Description |
|----------|-------|-------------|
| `EVENT_TOPIC_ADMIN` | `"TOPIC_ADMIN"` | Administrative operations (upgrades, config, pausing) |
| `EVENT_TOPIC_DISPUTE` | `"TOPIC_DISPUTE"` | Dispute resolution and arbitration |
| `EVENT_TOPIC_ESCROW` | `"TOPIC_ESCROW"` | Escrow lifecycle events |
| `EVENT_TOPIC_PRIVACY` | `"TOPIC_PRIVACY"` | Privacy mode toggles |
| `EVENT_TOPIC_STEALTH` | `"TOPIC_STEALTH"` | Stealth address operations |

### Filtering by domain (Horizon API)

```javascript
// Subscribe to all admin events
horizon.stream('contract_events')
  .forContract(contractId)
  .withTopic(['TOPIC_ADMIN']);

// Subscribe to all escrow events
horizon.stream('contract_events')
  .forContract(contractId)
  .withTopic(['TOPIC_ESCROW']);
```

## Mandatory Replay Fields

All v2+ events include these fields in the **payload** (not topics):

| Field | Type | Source | Purpose |
|-------|------|--------|---------|
| `event_type_id` | u32 | Constant (`ETID_*`) | Stable numeric ID for schema routing |
| `schema_version` | u32 | `EVENT_SCHEMA_VERSION` | Schema version (currently 2) |
| `ledger_sequence` | u32 | `env.ledger().sequence()` | Ledger sequence number |
| `timestamp` | u64 | `env.ledger().timestamp()` | Ledger timestamp (Unix epoch) |

### Deduplication Strategy

Use a composite key to deduplicate events across multiple ingestion runs:

```typescript
const dedupKey = `${contractId}-${event.value.event_type_id}-${event.value.ledger_sequence}-${event.value.timestamp}`;
```

This key is stable and deterministic because:
- `event_type_id` is immutable across releases
- `ledger_sequence` and `timestamp` are sourced from the ledger
- Multiple events in the same ledger will have different `event_type_id` values

## Stable Event Type IDs

Event type IDs are **never reused or renumbered**. When an event is deprecated, its ID is retired.

### Escrow Domain (1-9)

| ID | Constant | Event Name | Description |
|----|----------|------------|-------------|
| 1 | `ETID_ESCROW_DEPOSITED` | `EscrowDeposited` | Escrow created and funded |
| 2 | `ETID_ESCROW_WITHDRAWN` | `EscrowWithdrawn` | Escrow released to recipient |
| 3 | `ETID_ESCROW_REFUNDED` | `EscrowRefunded` | Escrow refunded to owner |
| 4 | `ETID_ESCROW_DISPUTED` | `EscrowDisputed` | Escrow entered dispute state |
| 5 | `ETID_ESCROW_FINALIZED` | `EscrowFinalized` | Partial payments completed |
| 6 | `ETID_PARTIAL_PAYMENT` | `PartialPayment` | Partial payment applied |
| 7 | `ETID_AUX_INDICES_CLEANED` | `AuxIndicesCleaned` | Auxiliary index cleanup |
| 8 | `ETID_ESCROW_CLEANUP` | `EscrowCleanup` | Terminal escrow cleanup |

### Dispute Domain (10-19)

| ID | Constant | Event Name | Description |
|----|----------|------------|-------------|
| 10 | `ETID_ARBITER_VOTE_CAST` | `ArbiterVoteCast` | Arbiter vote recorded |
| 11 | `ETID_DISPUTE_RESOLVED` | `DisputeResolved` | Multi-sig dispute resolved |
| 12 | `ETID_DISPUTE_TIMEOUT_SET` | `DisputeTimeoutSet` | Dispute timeout configured |
| 13 | `ETID_DISPUTE_AUTO_RESOLVED` | `DisputeAutoResolved` | Dispute auto-resolved on timeout |
| 14 | `ETID_DISPUTE_EXPIRY_ACTION_SET` | `DisputeExpiryActionSet` | Default expiry action set |
| 15 | `ETID_DISPUTE_TIMEOUT_CONFIG_SET` | `DisputeTimeoutConfigSet` | Global timeout config set |

### Privacy Domain (20-29)

| ID | Constant | Event Name | Description |
|----|----------|------------|-------------|
| 20 | `ETID_PRIVACY_TOGGLED` | `PrivacyToggled` | Privacy mode enabled/disabled |

### Stealth Domain (30-39)

| ID | Constant | Event Name | Description |
|----|----------|------------|-------------|
| 30 | `ETID_EPHEMERAL_KEY_REGISTERED` | `EphemeralKeyRegistered` | Stealth address funded |
| 31 | `ETID_STEALTH_WITHDRAWN` | `StealthWithdrawn` | Stealth escrow withdrawn |
| 32 | `ETID_STEALTH_ESCROW_CLEANED` | `StealthEscrowCleaned` | Terminal stealth cleanup |

### Admin Domain (40-79)

| ID | Constant | Event Name | Description |
|----|----------|------------|-------------|
| 40 | `ETID_ADMIN_CHANGED` | `AdminChanged` | Admin rotated |
| 41 | `ETID_CONTRACT_INITIALIZED` | `ContractInitialized` | Contract initialized |
| 42 | `ETID_CONTRACT_MIGRATED` | `ContractMigrated` | Storage migration completed |
| 43 | `ETID_CONTRACT_PAUSED` | `ContractPaused` | Contract paused/unpaused |
| 44 | `ETID_CONTRACT_UPGRADED` | `ContractUpgraded` | WASM upgraded |
| 45 | `ETID_EMERGENCY_MODE_ACTIVATED` | `EmergencyModeActivated` | Emergency mode triggered |
| 46 | `ETID_FEE_COLLECTOR_ROTATED` | `FeeCollectorRotated` | Fee collector rotated |
| 47 | `ETID_FEE_CONFIG_CHANGED` | `FeeConfigChanged` | Global fee changed |
| 48 | `ETID_HOOK_REGISTERED` | `HookRegistered` | Lifecycle hook registered |
| 49 | `ETID_HOOK_UNREGISTERED` | `HookUnregistered` | Lifecycle hook removed |
| 50 | `ETID_PAUSE_FLAGS_CHANGED` | `PauseFlagsChanged` | Granular pause flags changed |
| 51 | `ETID_PER_ASSET_FEE_SET` | `PerAssetFeeSet` | Per-asset fee configured |
| 52 | `ETID_PLATFORM_WALLET_CHANGED` | `PlatformWalletChanged` | Platform wallet rotated |
| 53 | `ETID_UPGRADE_STARTED` | `UpgradeStarted` | Upgrade initiated |
| 54 | `ETID_UPGRADE_COMPLETED` | `UpgradeCompleted` | Upgrade finalized |
| 55 | `ETID_UPGRADE_WINDOW_SET` | `UpgradeWindowSet` | Upgrade window configured |

## Event Schemas

Below are detailed schemas for all events. Payload keys are listed **in alphabetical order** as enforced by the contract's runtime validation.

### Escrow Events

#### EscrowDeposited (ID: 1)

**Topics:** `["TOPIC_ESCROW", "EscrowDeposited", escrow_id, owner]`

**Payload:**
```typescript
{
  amount_due: i128,        // Total amount required
  amount_paid: i128,       // Amount deposited so far
  event_type_id: 1,
  expires_at: u64,         // Expiry timestamp
  ledger_sequence: u32,
  schema_version: 2,
  timestamp: u64,
  token: Address           // Asset address
}
```

#### EscrowWithdrawn (ID: 2)

**Topics:** `["TOPIC_ESCROW", "EscrowWithdrawn", escrow_id, owner]`

**Payload:**
```typescript
{
  amount: i128,            // Gross amount
  arbiter_fee: i128,       // Fee to arbiter
  collector_fee: i128,     // Fee to collector
  event_type_id: 2,
  fee: i128,               // Total fee deducted
  ledger_sequence: u32,
  net_payout: i128,        // Amount after fees
  platform_fee: i128,      // Fee to platform
  schema_version: 2,
  timestamp: u64,
  token: Address
}
```

#### EscrowRefunded (ID: 3)

**Topics:** `["TOPIC_ESCROW", "EscrowRefunded", escrow_id, owner]`

**Payload:**
```typescript
{
  amount: i128,
  event_type_id: 3,
  ledger_sequence: u32,
  schema_version: 2,
  timestamp: u64,
  token: Address
}
```

#### EscrowDisputed (ID: 4)

**Topics:** `["TOPIC_ESCROW", "EscrowDisputed", escrow_id, arbiter]`

**Payload:**
```typescript
{
  event_type_id: 4,
  ledger_sequence: u32,
  schema_version: 2,
  timestamp: u64
}
```

#### EscrowFinalized (ID: 5)

**Topics:** `["TOPIC_ESCROW", "EscrowFinalized", escrow_id, owner]`

**Payload:**
```typescript
{
  event_type_id: 5,
  ledger_sequence: u32,
  schema_version: 2,
  timestamp: u64,
  token: Address,
  total_amount: i128       // Final total after all partial payments
}
```

#### PartialPayment (ID: 6)

**Topics:** `["TOPIC_ESCROW", "PartialPayment", escrow_id, payer]`

**Payload:**
```typescript
{
  amount_due: i128,        // Total required
  amount_paid: i128,       // Total paid so far (including this payment)
  event_type_id: 6,
  ledger_sequence: u32,
  payment_amount: i128,    // Amount in this payment
  schema_version: 2,
  timestamp: u64,
  token: Address
}
```

#### AuxIndicesCleaned (ID: 7)

**Topics:** `["TOPIC_ESCROW", "AuxIndicesCleaned", escrow_id]`

**Payload:**
```typescript
{
  event_type_id: 7,
  indices_removed: u32,    // Count of auxiliary entries reclaimed
  ledger_sequence: u32,
  schema_version: 2,
  timestamp: u64
}
```

#### EscrowCleanup (ID: 8)

**Topics:** `["TOPIC_ESCROW", "EscrowCleanup", escrow_id]`

**Payload:**
```typescript
{
  event_type_id: 8,
  ledger_sequence: u32,
  schema_version: 2,
  timestamp: u64
}
```

### Dispute Events

#### ArbiterVoteCast (ID: 10)

**Topics:** `["TOPIC_DISPUTE", "ArbiterVoteCast", escrow_id, arbiter]`

**Payload:**
```typescript
{
  event_type_id: 10,
  ledger_sequence: u32,
  resolve_for_owner: bool, // Vote direction
  schema_version: 2,
  threshold: u32,          // Votes required to resolve
  timestamp: u64,
  vote_count: u32          // Total votes so far
}
```

#### DisputeResolved (ID: 11)

**Topics:** `["TOPIC_DISPUTE", "DisputeResolved", escrow_id, resolved_for_owner]`

**Payload:**
```typescript
{
  amount: i128,
  event_type_id: 11,
  ledger_sequence: u32,
  schema_version: 2,
  threshold: u32,
  timestamp: u64,
  total_votes: u32
}
```

#### DisputeTimeoutSet (ID: 12)

**Topics:** `["TOPIC_DISPUTE", "DisputeTimeoutSet", escrow_id]`

**Payload:**
```typescript
{
  action: Symbol,          // "refund_owner" or "pay_arbiter"
  event_type_id: 12,
  expires_at: u64,
  ledger_sequence: u32,
  schema_version: 2,
  timestamp: u64
}
```

#### DisputeAutoResolved (ID: 13)

**Topics:** `["TOPIC_DISPUTE", "DisputeAutoResolved", escrow_id, action]`

**Payload:**
```typescript
{
  amount: i128,
  event_type_id: 13,
  ledger_sequence: u32,
  recipient: Address,
  schema_version: 2,
  timestamp: u64
}
```

#### DisputeExpiryActionSet (ID: 14)

**Topics:** `["TOPIC_ADMIN", "DisputeExpiryActionSet"]`

**Payload:**
```typescript
{
  action: Symbol,          // Default action for timeouts
  event_type_id: 14,
  ledger_sequence: u32,
  schema_version: 2,
  timestamp: u64
}
```

#### DisputeTimeoutConfigSet (ID: 15)

**Topics:** `["TOPIC_ADMIN", "DisputeTimeoutConfigSet"]`

**Payload:**
```typescript
{
  event_type_id: 15,
  ledger_sequence: u32,
  schema_version: 2,
  timeout_secs: u64,       // Default timeout in seconds
  timestamp: u64
}
```

### Privacy Events

#### PrivacyToggled (ID: 20)

**Topics:** `["TOPIC_PRIVACY", "PrivacyToggled", owner]`

**Payload:**
```typescript
{
  enabled: bool,
  event_type_id: 20,
  ledger_sequence: u32,
  schema_version: 2,
  timestamp: u64
}
```

### Stealth Events

#### EphemeralKeyRegistered (ID: 30)

**Topics:** `["TOPIC_STEALTH", "EphemeralKeyRegistered", stealth_address, eph_pub]`

**Payload:**
```typescript
{
  amount_due: i128,
  amount_paid: i128,
  event_type_id: 30,
  expires_at: u64,
  ledger_sequence: u32,
  schema_version: 2,
  timestamp: u64,
  token: Address
}
```

#### StealthWithdrawn (ID: 31)

**Topics:** `["TOPIC_STEALTH", "StealthWithdrawn", stealth_address, recipient]`

**Payload:**
```typescript
{
  amount: i128,
  event_type_id: 31,
  ledger_sequence: u32,
  schema_version: 2,
  timestamp: u64,
  token: Address
}
```

#### StealthEscrowCleaned (ID: 32)

**Topics:** `["TOPIC_STEALTH", "StealthEscrowCleaned", stealth_address]`

**Payload:**
```typescript
{
  event_type_id: 32,
  ledger_sequence: u32,
  schema_version: 2,
  timestamp: u64
}
```

### Admin Events

#### AdminChanged (ID: 40)

**Topics:** `["TOPIC_ADMIN", "AdminChanged", old_admin, new_admin]`

**Payload:**
```typescript
{
  event_type_id: 40,
  ledger_sequence: u32,
  schema_version: 2,
  timestamp: u64
}
```

#### ContractInitialized (ID: 41)

**Topics:** `["TOPIC_ADMIN", "ContractInitialized", admin]`

**Payload:**
```typescript
{
  contract_version: u32,
  event_schema_version: u32,
  event_type_id: 41,
  ledger_sequence: u32,
  paused: bool,
  schema_version: 2,
  timestamp: u64
}
```

#### ContractMigrated (ID: 42)

**Topics:** `["TOPIC_ADMIN", "ContractMigrated", admin]`

**Payload:**
```typescript
{
  event_type_id: 42,
  from_version: u32,
  ledger_sequence: u32,
  schema_version: 2,
  timestamp: u64,
  to_version: u32
}
```

#### ContractPaused (ID: 43)

**Topics:** `["TOPIC_ADMIN", "ContractPaused", admin]`

**Payload:**
```typescript
{
  event_type_id: 43,
  ledger_sequence: u32,
  paused: bool,
  schema_version: 2,
  timestamp: u64
}
```

#### ContractUpgraded (ID: 44)

**Topics:** `["TOPIC_ADMIN", "ContractUpgraded", new_wasm_hash, admin]`

**Payload:**
```typescript
{
  event_type_id: 44,
  ledger_sequence: u32,
  schema_version: 2,
  timestamp: u64
}
```

#### EmergencyModeActivated (ID: 45)

**Topics:** `["TOPIC_ADMIN", "EmergencyModeActivated", admin]`

**Payload:**
```typescript
{
  event_type_id: 45,
  ledger_sequence: u32,
  schema_version: 2,
  timestamp: u64
}
```

#### FeeCollectorRotated (ID: 46)

**Topics:** `["TOPIC_ADMIN", "FeeCollectorRotated", new_collector]`

**Payload:**
```typescript
{
  event_type_id: 46,
  ledger_sequence: u32,
  rotation_index: u32,
  schema_version: 2,
  timestamp: u64
}
```

#### FeeConfigChanged (ID: 47)

**Topics:** `["TOPIC_ADMIN", "FeeConfigChanged"]`

**Payload:**
```typescript
{
  event_type_id: 47,
  fee_bps: u32,            // Basis points (1 bps = 0.01%)
  ledger_sequence: u32,
  schema_version: 2,
  timestamp: u64
}
```

#### HookRegistered (ID: 48)

**Topics:** `["TOPIC_ADMIN", "HookRegistered", hook_contract]`

**Payload:**
```typescript
{
  event_type_id: 48,
  ledger_sequence: u32,
  schema_version: 2,
  timestamp: u64
}
```

#### HookUnregistered (ID: 49)

**Topics:** `["TOPIC_ADMIN", "HookUnregistered", hook_contract]`

**Payload:**
```typescript
{
  event_type_id: 49,
  ledger_sequence: u32,
  schema_version: 2,
  timestamp: u64
}
```

#### PauseFlagsChanged (ID: 50)

**Topics:** `["TOPIC_ADMIN", "PauseFlagsChanged", admin]`

**Payload:**
```typescript
{
  event_type_id: 50,
  flags_disabled: u64,     // Bitmask of disabled operations
  flags_enabled: u64,      // Bitmask of enabled operations
  ledger_sequence: u32,
  schema_version: 2,
  timestamp: u64
}
```

#### PerAssetFeeSet (ID: 51)

**Topics:** `["TOPIC_ADMIN", "PerAssetFeeSet", token]`

**Payload:**
```typescript
{
  arbiter_bps: u32,
  arbiter_fee_denominator: u32,
  arbiter_fee_numerator: u32,
  collector_fee_denominator: u32,
  collector_fee_numerator: u32,
  event_type_id: 51,
  fee_bps: u32,
  ledger_sequence: u32,
  platform_fee_denominator: u32,
  platform_fee_numerator: u32,
  schema_version: 2,
  timestamp: u64
}
```

#### PlatformWalletChanged (ID: 52)

**Topics:** `["TOPIC_ADMIN", "PlatformWalletChanged", wallet]`

**Payload:**
```typescript
{
  event_type_id: 52,
  ledger_sequence: u32,
  schema_version: 2,
  timestamp: u64
}
```

#### UpgradeStarted (ID: 53)

**Topics:** `["TOPIC_ADMIN", "UpgradeStarted", admin]`

**Payload:**
```typescript
{
  event_type_id: 53,
  ledger_sequence: u32,
  new_version: u32,
  new_wasm_hash: BytesN<32>,
  old_version: u32,
  schema_version: 2,
  timestamp: u64,
  window_end: u64,
  window_start: u64
}
```

#### UpgradeCompleted (ID: 54)

**Topics:** `["TOPIC_ADMIN", "UpgradeCompleted", admin]`

**Payload:**
```typescript
{
  event_type_id: 54,
  ledger_sequence: u32,
  new_version: u32,
  old_version: u32,
  schema_version: 2,
  timestamp: u64
}
```

#### UpgradeWindowSet (ID: 55)

**Topics:** `["TOPIC_ADMIN", "UpgradeWindowSet", admin]`

**Payload:**
```typescript
{
  event_type_id: 55,
  ledger_sequence: u32,
  schema_version: 2,
  timestamp: u64,
  window_end: u64,
  window_start: u64
}
```

## Indexer Implementation Guide

### Event Router

```typescript
interface ContractEvent {
  contractId: string;
  topics: string[];
  value: Record<string, any>;
}

async function handleContractEvent(event: ContractEvent) {
  // Extract routing metadata
  const eventTypeId = event.value.event_type_id;
  const schemaVersion = event.value.schema_version;
  
  // Check schema compatibility
  if (schemaVersion !== 2) {
    throw new Error(`Unsupported schema version: ${schemaVersion}`);
  }
  
  // Route by stable ID
  switch (eventTypeId) {
    case 1:  return handleEscrowDeposited(event);
    case 2:  return handleEscrowWithdrawn(event);
    case 3:  return handleEscrowRefunded(event);
    case 4:  return handleEscrowDisputed(event);
    case 5:  return handleEscrowFinalized(event);
    case 6:  return handlePartialPayment(event);
    case 7:  return handleAuxIndicesCleaned(event);
    case 8:  return handleEscrowCleanup(event);
    case 10: return handleArbiterVoteCast(event);
    case 11: return handleDisputeResolved(event);
    case 12: return handleDisputeTimeoutSet(event);
    case 13: return handleDisputeAutoResolved(event);
    case 14: return handleDisputeExpiryActionSet(event);
    case 15: return handleDisputeTimeoutConfigSet(event);
    case 20: return handlePrivacyToggled(event);
    case 30: return handleEphemeralKeyRegistered(event);
    case 31: return handleStealthWithdrawn(event);
    case 32: return handleStealthEscrowCleaned(event);
    case 40: return handleAdminChanged(event);
    case 41: return handleContractInitialized(event);
    case 42: return handleContractMigrated(event);
    case 43: return handleContractPaused(event);
    case 44: return handleContractUpgraded(event);
    case 45: return handleEmergencyModeActivated(event);
    case 46: return handleFeeCollectorRotated(event);
    case 47: return handleFeeConfigChanged(event);
    case 48: return handleHookRegistered(event);
    case 49: return handleHookUnregistered(event);
    case 50: return handlePauseFlagsChanged(event);
    case 51: return handlePerAssetFeeSet(event);
    case 52: return handlePlatformWalletChanged(event);
    case 53: return handleUpgradeStarted(event);
    case 54: return handleUpgradeCompleted(event);
    case 55: return handleUpgradeWindowSet(event);
    default:
      console.warn(`Unknown event type ID: ${eventTypeId}`);
  }
}
```

### Cross-Validation

Use replay fields to validate against Horizon data:

```typescript
async function validateEventReplay(event: ContractEvent, horizonTx: any) {
  const contractLedger = event.value.ledger_sequence;
  const horizonLedger = horizonTx.ledger_attr;
  
  if (contractLedger !== horizonLedger) {
    throw new Error(
      `Ledger mismatch: contract reported ${contractLedger}, ` +
      `Horizon reported ${horizonLedger}`
    );
  }
  
  // Additional validation...
}
```

## Version History

| Schema Version | Contract Version | Changes |
|----------------|------------------|---------|
| 1 | 0 | Initial schema (no `event_type_id` or `ledger_sequence`) |
| 2 | 1+ | Added `event_type_id`, `ledger_sequence`, stable IDs (current) |

## Related Documentation

- [Contract README](../../contract/README.md) — High-level contract overview
- [Upgrade Safety Gate](../../contract/docs/UPGRADE_SAFETY_GATE.md) — Upgrade workflow and events
- [events.rs](../../contract/contracts/Folder/src/events.rs) — Source of truth for event definitions

## Support

For questions about event schemas or indexer integration, see:
- GitHub Issues: https://github.com/BlockDash-Studios/RustAcademy/issues
- Contract source: `app/contract/contracts/Folder/src/events.rs`
