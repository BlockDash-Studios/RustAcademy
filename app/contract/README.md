

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

## Fee Configuration (Fee Router v2 — Issue #305)

The contract supports flexible, multi-tier fee configuration with global defaults and per-asset overrides.

> **📖 For detailed examples and patterns, see [FEE_CONFIGURATION_GUIDE.md](./FEE_CONFIGURATION_GUIDE.md).**

### Fee Resolution Priority

Fees are resolved in the following priority order:

1. **Per-asset override** — If configured for a specific token, uses that fee immediately
2. **Oracle dynamic pricing** — If oracle is configured and price is fresh, uses USD-based fee
3. **Global static config** — Falls back to global basis points setting

### Global Fee Configuration

Set a global fee that applies to all tokens unless overridden:

```rust
// Set global fee to 2% (200 basis points)
client.set_fee_config(
    &admin,
    &FeeConfig {
        fee_bps: 200,
        schema_version: FEE_CONFIG_SCHEMA_VERSION,
    },
)?;
```

### Per-Asset Fee Overrides

Override the global fee for specific tokens with per-asset configuration:

```rust
// Set XLM fee to 1% (100 bps), with 20% arbiter split
client.set_per_asset_fee(
    &admin,
    &xlm_token,
    &PerAssetFeeConfig {
        fee_bps: 100,                  // 1% fee for XLM
        arbiter_bps: 2000,             // 20% of fee goes to arbiter
        arbiter_fee: FeeRatio::default(),    // Optional explicit split
        platform_fee: FeeRatio::default(),
        collector_fee: FeeRatio::default(),
        schema_version: PER_ASSET_FEE_SCHEMA_VERSION,
    },
)?;
```

### Explicit Fee Distribution

Use explicit `FeeRatio` prescaling for precise fee splits:

```rust
// Split fee into exact portions: 40% arbiter, 30% platform, 30% collector
client.set_per_asset_fee(
    &admin,
    &token,
    &PerAssetFeeConfig {
        fee_bps: 500,                  // Total 5% fee
        arbiter_bps: 0,                // Legacy split disabled
        arbiter_fee: FeeRatio { numerator: 2, denominator: 5 },    // 40%
        platform_fee: FeeRatio { numerator: 3, denominator: 10 },  // 30%
        collector_fee: FeeRatio { numerator: 3, denominator: 10 }, // 30%
        schema_version: PER_ASSET_FEE_SCHEMA_VERSION,
    },
)?;
```

### Query Per-Asset Fees

```rust
// Get per-asset fee config for a specific token
let config = client.get_per_asset_fee(&token);

// Returns Option<PerAssetFeeConfig>
// None = use global config or oracle pricing
// Some(config) = use this token-specific config
```

### Fee Routing Breakdown

When routing payouts with fees, the breakdown is returned:

```rust
FeeBreakdown {
    net_payout: i128,      // Amount recipient receives
    total_fee: i128,       // Total fee collected
    arbiter_fee: i128,     // Portion paid to arbiter (if applicable)
    platform_fee: i128,    // Portion paid to platform
    collector_fee: i128,   // Portion paid to fee collector
}
```

Example: amount=10,000, fee_bps=200 (2%), arbiter_bps=2000 (20% of fee):
- Total fee: 200
- Arbiter portion: 40 (20% of fee)
- Collector portion: 160 (80% of fee)
- Net to recipient: 9,800

### Collector Rotation

Update the fee collector address without disrupting existing escrows:

```rust
// Rotate to a new collector; old escrows use new collector at settlement
let new_index = client.rotate_collector(&admin, &new_collector_address)?;
```

All subsequent payouts will route fees to the new collector. Existing escrows automatically use the new collector when they're spent or refunded.

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