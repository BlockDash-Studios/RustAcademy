

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