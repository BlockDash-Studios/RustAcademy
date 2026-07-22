# Upgrade Safety Gate & Post-Upgrade Invariants

**Issue #432 + #318** | Wave 5 – Lifecycle Management

## Overview

This document describes the contract-level safeguards and invariant enforcement mechanisms for safe, controlled upgrades in RustAcademy.

### Key Features

1. **Explicit Upgrade Windows** – Upgrades only occur during admin-configured time windows
2. **Upgrade Gate Master Switch** – Admin can enable/disable all upgrades globally (Issue #318)
3. **Post-Upgrade Invariants** – Deterministic checks validate state after migration
4. **Upgrade Lifecycle Events** – `UpgradeStarted` and `UpgradeCompleted` for indexer tracking
5. **In-Progress Flag** – Prevents concurrent upgrade attempts
6. **Admin-Controlled Gating** – Only admins can set windows and control upgrades
7. **Safety Check View** – `check_upgrade_safety()` provides pre-upgrade validation (Issue #318)

---

## Storage Schema (Issue #432 + #318)

New storage keys added to `DataKey` enum:

| Key                  | Type | Purpose                                                       |
| -------------------- | ---- | ------------------------------------------------------------- |
| `UpgradeWindowStart` | u64  | Ledger timestamp when upgrades become allowed                 |
| `UpgradeWindowEnd`   | u64  | Ledger timestamp when upgrades become blocked (0 = unbounded) |
| `UpgradeInProgress`  | bool | Flag: upgrade currently in-flight                             |
| `UpgradeGateEnabled` | bool | Master switch: when false, all upgrades are blocked (default true) |

---

## Upgrade Workflow

### Step 0: Configure the Upgrade Gate (Issue #318)

```rust
set_upgrade_gate(env, caller, enabled)
```

- **enabled**: `true` to allow upgrades (default), `false` to block all upgrades
- **Requirements**: Caller must be admin

The gate is a master switch that overrides the upgrade window. When disabled, `start_upgrade` is blocked regardless of window configuration. Useful for emergency lockdowns or staged rollouts.

**Example**:

```rust
admin_account.set_upgrade_gate(contract, false)?;  // Lock down upgrades
admin_account.set_upgrade_gate(contract, true)?;   // Re-enable upgrades
```

### Step 1: Admin Sets Upgrade Window

```rust
set_upgrade_window(env, caller, start_epoch, end_epoch)
```

- **start_epoch**: Ledger timestamp when window opens (0 = reset/unset)
- **end_epoch**: Ledger timestamp when window closes (0 = no upper bound)
- **Requirements**: Caller must be admin; `end > start` if both non-zero

**Events**: None (internal state update)

**Example**: Allow upgrades between block 1000 and 2000

```rust
admin_account.set_upgrade_window(contract, 1000u64, 2000u64)?;
```

### Step 2: Admin Initiates Upgrade (Window Checks Here)

```rust
start_upgrade(env, caller, new_version)
```

- **new_version**: Target contract version after migration
- **Requirements**:
  - Caller must be admin
  - Current time must be within active window (AC1)
  - No upgrade already in-progress

**Checks** (AC1 – Acceptance Criterion):

- Window is set (`start != 0`)
- Current ledger timestamp ≥ `start`
- If `end != 0`: current ledger timestamp ≤ `end`
- Not already in-progress

**Events**: `UpgradeStarted {admin, old_version, new_version, window_start, window_end, timestamp}`

**Example**:

```rust
admin_account.start_upgrade(contract, 2u32)?;
// → UpgradeStarted event emitted
```

### Step 3: Update WASM

The caller (or deployment service) publishes new WASM and calls:

```rust
upgrade(env, caller, new_wasm_hash)
```

- **new_wasm_hash**: 32-byte SHA256 of new contract WASM
- **Requirements**: Caller must be admin

**Events**: `ContractUpgraded {admin, new_wasm_hash, timestamp}`

**Note**: This step does NOT perform storage migration; it only swaps the executable code.

### Step 4: Run Migration & Validate Invariants

```rust
complete_upgrade(env, caller, new_version)
```

- **new_version**: Expected target version (0 = auto-detect)
- **Requirements**:
  - Caller must be admin
  - `UpgradeInProgress` flag must be true
  - Must have called `start_upgrade` first

**Internal Flow**:

1. Call `migrate()` to run storage migrations
2. Validate post-upgrade invariants (AC2)
3. Clear `UpgradeInProgress` flag
4. Emit `UpgradeCompleted` event

**Events**: `UpgradeCompleted {admin, old_version, new_version, timestamp}`

**Example**:

```rust
admin_account.complete_upgrade(contract, 2u32)?;
// → UpgradeCompleted event emitted
// → Invariants checked; panics if violated
```

---

## Safety Check View (Issue #318)

### check_upgrade_safety()

Returns an [`UpgradeSafetyReport`] with the full breakdown of upgrade preconditions:

```rust
let report = client.check_upgrade_safety();
assert!(report.is_safe, "upgrade should be safe");
assert!(report.gate_enabled, "gate must be enabled");
assert!(report.window_active, "window must be active");
assert!(!report.upgrade_in_progress, "no upgrade in progress");
assert!(report.version_compatible, "version must be in range");
assert!(report.invariants_satisfied, "fee invariants must hold");
```

### UpgradeSafetyReport Fields

| Field                 | Type  | Description                                             |
| --------------------- | ----- | ------------------------------------------------------- |
| `is_safe`             | bool  | Overall safety: true only when all checks pass          |
| `gate_enabled`        | bool  | Whether the master switch is enabled                    |
| `window_active`       | bool  | Whether the current time falls within the window        |
| `upgrade_in_progress` | bool  | Whether an upgrade is already in-flight                 |
| `version_compatible`  | bool  | Whether the contract version is within supported range  |
| `invariants_satisfied`| bool  | Whether critical pre-upgrade invariants hold            |

### get_upgrade_status()

Returns the complete [`UpgradeState`] including the `gate_enabled` field:

```rust
let status = client.get_upgrade_status();
assert!(status.gate_enabled);
assert!(!status.in_progress);
```

---

## Acceptance Criteria

### AC1: Upgrades Blocked Outside Window

**Test**: `upgrade_safety_gate_blocks_upgrade_outside_window`

- ✅ `start_upgrade()` fails when no window is set
- ✅ `start_upgrade()` fails before window start time
- ✅ `start_upgrade()` fails after window end time
- ✅ `start_upgrade()` succeeds within window `[start, end)`

**Error Code**: `UpgradeWindowNotActive`

### AC2: Post-Upgrade Invariants Enforced Deterministically

**Test**: `upgrade_safety_gate_post_upgrade_invariants_enforced`

Invariants checked in `storage::assert_post_upgrade_invariants()`:

1. **Fee Bounds**: `fee_bps ≤ 10_000` basis points
2. **Version Set**: `contract_version == CURRENT_CONTRACT_VERSION`
3. **Admin Initialized**: `admin != None`
4. **Escrow Counter Valid**: u64 (always valid, implicit)
5. **Per-Asset Fees**: Validated at write time (bounds: `fee_bps ≤ 10_000`, `arbiter_bps ≤ 10_000`)

**Violation Behavior**: Panic with `InternalError` deterministically

**Example Violation**:

- If a corrupted migration sets `fee_bps = 20_000`, `complete_upgrade()` panics
- Indexers/monitors can detect via transaction failure logs

### AC3: Indexers Track Upgrades via Events

**Test**: `upgrade_safety_gate_emits_events`

Events emitted in strict sequence:

```
UpgradeStarted {
  admin,
  old_version,
  new_version,
  window_start,
  window_end,
  timestamp,
  schema_version = 2
}

ContractUpgraded {
  admin,
  new_wasm_hash,
  timestamp,
  schema_version = 2
}

[Migration storage changes]

UpgradeCompleted {
  admin,
  old_version,
  new_version,
  timestamp,
  schema_version = 2
}
```

**Indexer Use**:

- Filter by topic `"TOPIC_ADMIN"` and type `"UpgradeStarted"` / `"UpgradeCompleted"`
- Group by `(admin, old_version, new_version, timestamp)` tuples
- Track deployment timeline and version history

---

## Event Details

### UpgradeStarted

**Event Type ID:** `ETID_UPGRADE_STARTED = 53`  
**Topic Namespace:** `EVENT_TOPIC_ADMIN = "TOPIC_ADMIN"`

```rust
#[contractevent(topics = ["TOPIC_ADMIN", "UpgradeStarted"])]
pub struct UpgradeStartedEvent {
    #[topic]
    pub admin: Address,

    pub event_type_id: u32,             // = 53 (ETID_UPGRADE_STARTED)
    pub schema_version: u32,            // = 2
    pub ledger_sequence: u32,           // Ledger sequence number
    pub old_version: u32,               // Current contract version
    pub new_version: u32,               // Target version
    pub new_wasm_hash: BytesN<32>,      // Target WASM hash
    pub window_start: u64,              // Ledger timestamp (start of window)
    pub window_end: u64,                // Ledger timestamp (end, 0 = unbounded)
    pub timestamp: u64,                 // Ledger timestamp (now)
}
```

### UpgradeCompleted

**Event Type ID:** `ETID_UPGRADE_COMPLETED = 54`  
**Topic Namespace:** `EVENT_TOPIC_ADMIN = "TOPIC_ADMIN"`

```rust
#[contractevent(topics = ["TOPIC_ADMIN", "UpgradeCompleted"])]
pub struct UpgradeCompletedEvent {
    #[topic]
    pub admin: Address,

    pub event_type_id: u32,             // = 54 (ETID_UPGRADE_COMPLETED)
    pub schema_version: u32,            // = 2
    pub ledger_sequence: u32,           // Ledger sequence number
    pub old_version: u32,               // Version before migration
    pub new_version: u32,               // Version after migration
    pub timestamp: u64,                 // Ledger timestamp (now)
}
```

**Note:** All upgrade events use the `TOPIC_ADMIN` namespace and include mandatory replay fields (`event_type_id`, `schema_version`, `ledger_sequence`, `timestamp`) for indexer compatibility. See the [contract README](../README.md#events) for complete event schema documentation.

---

## Error Codes

New upgrade-specific errors:

| Error                     | Code | Trigger                        | Context                                     |
| ------------------------- | ---- | ------------------------------ | ------------------------------------------- |
| `UpgradeWindowNotActive`  | 502  | Upgrade window not active      | `start_upgrade()` outside `[start, end)`    |
| `UpgradeAlreadyInProgress`| 503  | Upgrade already in progress    | `start_upgrade()` called twice              |
| `UpgradeNotInProgress`    | 504  | No upgrade in progress         | `upgrade()` / `complete_upgrade()` without `start_upgrade()` |

Legacy repurposed codes removed; backend now maps these to stable API codes.

---

## Usage Example

### Planned Upgrade Scenario

**Day 1, 13:00 UTC**: Admin schedules an upgrade window for Day 2, 14:00–15:00 UTC

```rust
let block_timestamp = env.ledger().timestamp(); // e.g., 1748520000 (May 30, 2025 @ 13:00)
let start = block_timestamp + 86_400u64;         // +1 day = 1748606400
let end = start + 3_600u64;                      // +1 hour window

admin.set_upgrade_window(contract, start, end)?;
// No events yet; state updated silently
```

**Day 2, 14:05 UTC**: Admin initiates upgrade during window

```rust
admin.start_upgrade(contract, 2u32)?;
// → Emits UpgradeStarted { admin, 1, 2, 1748606400, 1748610000, 1748610300 }
```

**Day 2, 14:10 UTC**: WASM uploaded; deploy swap

```rust
admin.upgrade(contract, new_wasm_hash)?;
// → Emits ContractUpgraded { admin, new_wasm_hash, 1748610600 }
```

**Day 2, 14:15 UTC**: Run migration & invariant checks

```rust
let new_version = admin.complete_upgrade(contract, 2u32)?;
// Internally:
//   1. Calls migrate() → runs v0→v1 logic
//   2. Calls assert_post_upgrade_invariants() → checks fee_bps, version, admin, etc.
//   3. Clears UpgradeInProgress flag
//   4. Emits UpgradeCompleted { admin, 1, 2, 1748610900 }
// Returns: 2
```

### Blocked Upgrade (Outside Window)

```rust
// Same setup as above; but now it's Day 1, 13:00 UTC (before window)
admin.start_upgrade(contract, 2u32)?;
// → Err: UpgradeWindowNotActive ("upgrade window not active")
```

---

## Testing

### Unit Tests (in `upgrade_test.rs`)

Run all upgrade safety tests:

```bash
cargo test upgrade_safety_gate_ -- --nocapture
```

Tests included:

1. **`upgrade_safety_gate_blocks_upgrade_outside_window`**
   - Verifies AC1: blocks before/after window

2. **`upgrade_safety_gate_post_upgrade_invariants_enforced`**
   - Verifies AC2: invariant validation succeeds on clean upgrade

3. **`upgrade_safety_gate_emits_events`**
   - Verifies AC3: events emitted in correct sequence

4. **`upgrade_safety_gate_blocks_double_start`**
   - Ensures `UpgradeInProgress` flag prevents concurrent upgrades

5. **`upgrade_safety_gate_non_admin_blocked`**
   - Verifies only admins can gate/start upgrades

6. **`upgrade_safety_gate_blocks_when_gate_disabled`** (Issue #318)
   - Verifies gate master switch blocks upgrades when disabled

7. **`upgrade_safety_gate_succeeds_when_gate_enabled`** (Issue #318)
   - Verifies upgrades succeed when gate is explicitly enabled

8. **`upgrade_safety_gate_check_upgrade_safety_reports_version`** (Issue #318)
   - Verifies check_upgrade_safety returns correct report

9. **`upgrade_safety_gate_check_reports_unsafe_*`** (Issue #318, 4 tests)
   - Verifies safety report is unsafe for: disabled gate, no window, in-progress, invariant violation

10. **`upgrade_safety_gate_get_upgrade_status_includes_gate_enabled`** (Issue #318)
    - Verifies get_upgrade_status returns gate_enabled field

11. **`upgrade_safety_gate_non_admin_cannot_set_gate`** (Issue #318)
    - Verifies admin-only enforcement on set_upgrade_gate

12. **`upgrade_safety_gate_toggle_preserves_contract_state`** (Issue #318)
    - Regression: gate toggle does not corrupt escrow/fee/privacy state

13. **`upgrade_safety_gate_full_lifecycle`** (Issue #318)
    - End-to-end: enabled → disabled → re-enabled → upgrade

14. **`upgrade_safety_gate_migrate_works_independently_of_gate`** (Issue #318)
    - Verifies migrate() works regardless of gate setting

### Integration Tests

When deployed on-chain:

1. Set window during off-peak hours
2. Trigger via testnet admin account
3. Monitor event logs via Stellar event stream
4. Verify invariants by querying contract state post-upgrade
5. Check no stale escrows in `Pending` state from old code

---

## Migration Checklist

When upgrading between contract versions:

- [ ] Generate new WASM hash: `soroban contract build` → SHA256
- [ ] Verify upgrade gate is enabled: `check_upgrade_safety()` returns `is_safe = true`
- [ ] Admin calls `set_upgrade_window(start, end)` during maintenance window
- [ ] Admin calls `start_upgrade(new_version)`
- [ ] Deployment service uploads WASM
- [ ] Admin calls `upgrade(wasm_hash)`
- [ ] Admin calls `complete_upgrade(new_version)`
- [ ] Monitor `UpgradeCompleted` event
- [ ] Query contract version: `get_version()` should match `new_version`
- [ ] Run smoke tests: `deposit`, `withdraw`, `set_privacy` (regression suite)
- [ ] Verify no transaction failures post-upgrade (invariant panic)

---

## FAQ

**Q: What's the difference between `set_upgrade_gate(false)` and not setting a window?**
A: Both block upgrades, but for different reasons. No window set (`start = 0`) means the upgrade window hasn't been configured. Gate disabled (`set_upgrade_gate(false)`) is an explicit admin override that blocks upgrades even when a window is active. Use the gate for emergency lockdowns; use the window for scheduled maintenance.

**Q: Can I call `migrate()` without `start_upgrade()`?**
A: Yes. `migrate()` is standalone and always allowed. `start_upgrade()` / `complete_upgrade()` add extra gating for safety but are optional for ad-hoc migrations.

**Q: What if I miss the upgrade window?**
A: Call `set_upgrade_window()` again to open a new one. There's no "missed upgrade" penalty; you just reschedule.

**Q: Can the window be changed mid-upgrade?**
A: Yes, but not recommended. Changing `start` / `end` while `UpgradeInProgress` is true could cause confusion. Ensure `complete_upgrade()` finishes first.

**Q: What happens if invariants fail?**
A: `complete_upgrade()` panics with `InternalError`. The contract state is rolled back (no partial writes), and the upgrade is effectively aborted. Retry after fixing the migration logic.

**Q: How do indexers detect a failed upgrade?**
A: Look for `UpgradeStarted` events without a corresponding `UpgradeCompleted` in the same ledger sequence, or for transaction failures (ledger meta) between start/end timestamps.

---

## Related Issues

- **#310**: Upgrade simulation test harness (foundational)
- **#318**: Upgrade gate master switch + migration regression coverage
- **#432**: Upgrade safety gate + invariants (this issue)
- **#157**: Privacy v2 (uses similar event patterns)
- **#305**: Fee Router v2 (affected by fee invariant bounds)

---

## References

- [Soroban Contract Upgrade Guide](https://developers.stellar.org/build/guides/soroban-migration)
- [ RustAcademy Invariant Checks](./UPGRADE_SAFETY_GATE.md) (this file)
- [`storage.rs::assert_post_upgrade_invariants()`](../contracts/ RustAcademy/src/storage.rs)
- [`admin.rs::start_upgrade()`, `complete_upgrade()`](../contracts/ RustAcademy/src/admin.rs)
