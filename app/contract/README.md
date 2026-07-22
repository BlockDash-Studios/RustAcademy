

# ⚡ RustAcademy Soroban Contracts

> Trustless reward distribution and credential verification on Stellar.

---

## Overview

RustAcademy uses Soroban smart contracts to manage:

* Rewards
* Reputation
* Certificates
* Badges
* Governance
* Escrow

---

## Contracts

### reward_pool

Handles XLM reward distribution.

Functions:

```rust
create_pool()
deposit_rewards()
release_reward()
get_balance()
```

---

### course_registry

Stores course metadata.

Functions:

```rust
register_course()
update_course()
archive_course()
```

---

### reputation

Tracks learner and tutor reputation.

Functions:

```rust
increase_score()
decrease_score()
get_score()
```

---

### certificate_nft

Issues course completion certificates.

Functions:

```rust
mint_certificate()
verify_certificate()
revoke_certificate()
```

---

### badge_nft

Achievement badge system.

Functions:

```rust
mint_badge()
get_badges()
```

---

### escrow_payout

Handles tutor earnings.

Functions:

```rust
create_escrow()
release_escrow()
cancel_escrow()
```

---

### governance

Community governance.

Functions:

```rust
create_proposal()
vote()
execute_proposal()
```

---

## Contract Architecture

```text
Course Completion
        ↓
 AI Grading
        ↓
 Tutor Verification
        ↓
 reward_pool
        ↓
 reputation
        ↓
 certificate_nft
        ↓
 badge_nft
```

---

## Build Contracts

```bash
cargo build \
--target wasm32-unknown-unknown \
--release
```

---

## Run Tests

```bash
cargo test
```

---

## Deploy

```bash
stellar contract deploy \
--network testnet \
--wasm target/wasm32-unknown-unknown/release/reward_pool.wasm
```

---

## Contract Security Principles

### Anti-Cheat

* Oracle verification
* Duplicate submission prevention
* Reward throttling

### Access Control

* Admin-only functions
* Tutor-only functions
* Governance-controlled upgrades

### Financial Safety

* No floating-point arithmetic
* i128 token calculations
* Escrow-based payouts
* Replay protection

---

## Events

All events emitted by the `Folder` contract follow canonical schema definitions (`EVENT_SCHEMAS`) with stable event type IDs (`ETID_*`) and deterministic replay fields (`EVENT_REPLAY_FIELDS`: `event_type_id`, `ledger_sequence`, `schema_version`, `timestamp`).

The contract enforces full runtime schema validation (`validate_event_schemas`) to guarantee:
- Uniqueness of event names and numeric event type IDs.
- Valid domain topic namespaces (`TOPIC_ADMIN`, `TOPIC_DISPUTE`, `TOPIC_ESCROW`, `TOPIC_PRIVACY`, `TOPIC_STEALTH`).
- Alphabetically sorted payload keys without duplicates.
- Presence of all required replay fields.
- Runtime cross-checking of all emitted events against `EVENT_SCHEMAS`.

### Event Topic Namespaces

All events use a stable topic namespace in `topics[0]` for domain-based filtering:

| Constant | Value | Purpose |
|----------|-------|---------|
| `EVENT_TOPIC_ADMIN` | `"TOPIC_ADMIN"` | Administrative operations (upgrades, configuration, pausing) |
| `EVENT_TOPIC_DISPUTE` | `"TOPIC_DISPUTE"` | Dispute resolution and arbitration |
| `EVENT_TOPIC_ESCROW` | `"TOPIC_ESCROW"` | Escrow lifecycle (deposit, withdraw, refund) |
| `EVENT_TOPIC_PRIVACY` | `"TOPIC_PRIVACY"` | Privacy mode toggles |
| `EVENT_TOPIC_STEALTH` | `"TOPIC_STEALTH"` | Stealth address operations |

### Stable Event Type IDs

Every event carries a numeric `event_type_id` that **never changes** across releases. Indexers and backends **must** use this ID as the primary routing key.

#### Escrow Domain (1-9)
- `ETID_ESCROW_DEPOSITED = 1` — Escrow created and funded
- `ETID_ESCROW_WITHDRAWN = 2` — Escrow released to recipient
- `ETID_ESCROW_REFUNDED = 3` — Escrow refunded to owner
- `ETID_ESCROW_DISPUTED = 4` — Escrow entered dispute state
- `ETID_ESCROW_FINALIZED = 5` — Partial payments completed
- `ETID_PARTIAL_PAYMENT = 6` — Partial payment applied
- `ETID_AUX_INDICES_CLEANED = 7` — Auxiliary index cleanup
- `ETID_ESCROW_CLEANUP = 8` — Terminal escrow cleanup

#### Dispute Domain (10-19)
- `ETID_ARBITER_VOTE_CAST = 10` — Arbiter vote recorded
- `ETID_DISPUTE_RESOLVED = 11` — Multi-sig dispute resolved
- `ETID_DISPUTE_TIMEOUT_SET = 12` — Dispute timeout configured
- `ETID_DISPUTE_AUTO_RESOLVED = 13` — Dispute auto-resolved on timeout
- `ETID_DISPUTE_EXPIRY_ACTION_SET = 14` — Default expiry action configured
- `ETID_DISPUTE_TIMEOUT_CONFIG_SET = 15` — Global timeout config set

#### Privacy Domain (20-29)
- `ETID_PRIVACY_TOGGLED = 20` — Privacy mode enabled/disabled

#### Stealth Domain (30-39)
- `ETID_EPHEMERAL_KEY_REGISTERED = 30` — Stealth address funded
- `ETID_STEALTH_WITHDRAWN = 31` — Stealth escrow withdrawn
- `ETID_STEALTH_ESCROW_CLEANED = 32` — Terminal stealth cleanup

#### Admin Domain (40-79)
- `ETID_ADMIN_CHANGED = 40` — Admin rotated
- `ETID_CONTRACT_INITIALIZED = 41` — Contract initialized
- `ETID_CONTRACT_MIGRATED = 42` — Storage migration completed
- `ETID_CONTRACT_PAUSED = 43` — Contract paused/unpaused
- `ETID_CONTRACT_UPGRADED = 44` — WASM upgraded
- `ETID_EMERGENCY_MODE_ACTIVATED = 45` — Emergency mode triggered
- `ETID_FEE_COLLECTOR_ROTATED = 46` — Fee collector rotated
- `ETID_FEE_CONFIG_CHANGED = 47` — Global fee changed
- `ETID_HOOK_REGISTERED = 48` — Lifecycle hook registered
- `ETID_HOOK_UNREGISTERED = 49` — Lifecycle hook removed
- `ETID_PAUSE_FLAGS_CHANGED = 50` — Granular pause flags changed
- `ETID_PER_ASSET_FEE_SET = 51` — Per-asset fee configured
- `ETID_PLATFORM_WALLET_CHANGED = 52` — Platform wallet rotated
- `ETID_UPGRADE_STARTED = 53` — Upgrade initiated
- `ETID_UPGRADE_COMPLETED = 54` — Upgrade finalized
- `ETID_UPGRADE_WINDOW_SET = 55` — Upgrade window configured

### Mandatory Replay Fields

All v2+ events include these fields in the payload (not topics):
- `event_type_id` (u32) — Stable numeric ID for schema routing
- `schema_version` (u32) — Always `EVENT_SCHEMA_VERSION` (currently 2)
- `ledger_sequence` (u32) — Ledger sequence number from `env.ledger().sequence()`
- `timestamp` (u64) — Ledger timestamp from `env.ledger().timestamp()`

These fields enable **deterministic deduplication** and **cross-validation** between contract-reported and Horizon-reported data.

### Indexer Integration

**Filtering by domain:**
```javascript
// Subscribe to all escrow events
const events = horizon.stream('contract_events')
  .forContract(contractId)
  .withTopic(['TOPIC_ESCROW']);
```

**Routing by stable ID:**
```javascript
const eventTypeId = event.value.event_type_id;
switch (eventTypeId) {
  case 1: return handleEscrowDeposited(event);
  case 2: return handleEscrowWithdrawn(event);
  case 3: return handleEscrowRefunded(event);
  // ...
}
```

**Deduplication key:**
```javascript
const dedupKey = `${event.value.event_type_id}-${event.value.ledger_sequence}-${event.contractId}-${event.value.timestamp}`;
```

---

## Metadata API

The `Folder` contract exposes a stable, read-only metadata surface for tooling, backends, and indexers (Issue #50, Issue #312). All calls are non-mutating and require no authorization.

| Method | Purpose |
|--------|---------|
| `get_deployment_metadata()` | Contract version, event schema version, recorded WASM hash, and contract ID. |
| `get_contract_health()` | Health status (`healthy`, `paused`, `upgrading`, `emergency`). |
| `get_feature_flags()` | Feature flags supported by this build (e.g. dispute timeout, upgrade gating, stealth). |
| `get_upgrade_state()` | Upgrade window and in-progress state. |
| `get_supported_versions()` | Supported contract and event schema version ranges. |
| `check_schema_compatibility(contract_version, event_schema_version)` | Whether a caller-supplied version pair is compatible. |
| `validate_event_schemas()` | Validate all static `EVENT_SCHEMAS` definitions against canonical schema rules. |
| `get_pause_flags()` | Granular pause bitmask. |

Tooling should call `check_schema_compatibility` before sending writes to avoid version mismatches.

## Testing Requirements

All contracts must maintain:

```text
≥ 90% test coverage
```

before deployment to production.

---