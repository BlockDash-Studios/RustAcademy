# Authorization Guards Guide

This document describes the normalized authorization guard system for the RustAcademy contract. All mutating entry points must use the shared guard helpers defined in `admin.rs` to ensure consistent security checks.

## Overview

The contract uses a set of shared guard helpers to enforce authorization requirements across all mutating entry points. These guards ensure that:

- Initialization is checked where required
- Emergency mode blocks appropriate operations
- Global pause blocks operations when set
- Feature pause blocks specific operations
- Reentrancy attacks are prevented
- Role-based authorization is enforced

## Guard Helpers

### Basic Guards

#### `require_initialized(env)`
Checks that the contract has been initialized. Returns `Unauthorized` if not initialized.

**Use cases:** Operations that require the contract to be in an initialized state.

#### `require_not_emergency_mode(env)`
Checks that emergency mode is not active. Returns `ContractPaused` if emergency mode is active.

**Use cases:** Operations that should be blocked during emergency mode (deposits, admin config).

#### `require_not_paused_global(env)`
Checks that the global pause flag is not set. Returns `ContractPaused` if paused.

**Use cases:** Operations that should be blocked when the contract is globally paused.

#### `require_feature_not_paused(env, flag)`
Checks that a specific feature pause flag is not set. Returns `OperationPaused` if the feature is paused.

**Use cases:** Operations that should be blocked when a specific feature is paused.

### Composite Guards

#### `guard_deposit(env, pause_flag)`
Standard guard for user-initiated deposit operations.

**Checks:** emergency mode, global pause, feature pause, reentrancy

**Use cases:** `deposit`, `deposit_with_commitment`, `deposit_partial`, `partial_payment`

#### `guard_withdraw(env, pause_flag)`
Standard guard for withdrawal operations.

**Checks:** global pause, feature pause, reentrancy

**Note:** Emergency mode does NOT block withdrawals (users need to access funds).

**Use cases:** `withdraw`, `stealth_withdraw`

#### `guard_refund(env, pause_flag)`
Standard guard for refund operations.

**Checks:** global pause, feature pause, reentrancy

**Use cases:** `refund`

#### `guard_dispute(env)`
Standard guard for dispute operations.

**Checks:** global pause, reentrancy

**Use cases:** `dispute`, `resolve_dispute`, `vote_for_dispute`, `resolve_dispute_multi_sig`

#### `guard_admin_config(env)`
Standard guard for admin configuration operations.

**Checks:** emergency mode, reentrancy

**Use cases:** `set_paused`, `pause_features`, `unpause_features`, `set_admin`, `set_fee_config`, `set_per_asset_fee`, `set_oracle_fee_config`, `set_platform_wallet`, `rotate_fee_collector`

#### `guard_initialized(env)`
Standard guard for operations that require initialization.

**Checks:** initialization, reentrancy

**Use cases:** `set_privacy`, `cleanup_escrow`, `extend_escrow_ttl`, `register_hook`, `unregister_hook`

#### `guard_stealth(env, pause_flag)`
Standard guard for stealth address operations.

**Checks:** global pause, feature pause, reentrancy

**Use cases:** `register_ephemeral_key`, `stealth_withdraw`

### Role-Based Guards

#### `require_admin(env, caller)`
Checks that the caller has the Admin role.

**Use cases:** Admin-only operations.

#### `require_any_role(env, caller, roles)`
Checks that the caller has at least one of the specified roles.

**Use cases:** Operations that require specific roles (e.g., Admin or Operator).

## Guard Selection Guide

When adding a new mutating entry point, use this decision tree to select the appropriate guard:

```
Is this a deposit operation?
├─ Yes → Use guard_deposit(env, PauseFlag::YourFeature as u64)
│
Is this a withdrawal operation?
├─ Yes → Use guard_withdraw(env, PauseFlag::YourFeature as u64)
│
Is this a refund operation?
├─ Yes → Use guard_refund(env, PauseFlag::Refund as u64)
│
Is this a dispute operation?
├─ Yes → Use guard_dispute(env)
│
Is this an admin config operation?
├─ Yes → Use guard_admin_config(env)
│
Is this a stealth address operation?
├─ Yes → Use guard_stealth(env, PauseFlag::YourFeature as u64)
│
Does this require initialization?
├─ Yes → Use guard_initialized(env)
│
Is this a read-only operation?
├─ Yes → No guard needed
│
None of the above?
└─ Review with team to determine appropriate guard
```

## Adding a New Mutating Entry Point

When adding a new public mutating entry point:

1. **Select the appropriate guard** from the guard selection guide above.
2. **Add the guard call** at the beginning of your function:
   ```rust
   pub fn new_operation(env: Env, caller: Address, ...) -> Result<(), RustAcademyError> {
       admin::guard_deposit(&env, PauseFlag::YourFeature as u64)?;
       // Your logic here
   }
   ```
3. **Add a test case** to `guard_test.rs` in the `GUARD_TEST_TABLE`:
   ```rust
   GuardTestCase {
       name: "new_operation",
       setup: setup_initialized_contract,
       test_fn: test_new_operation,
       expected_error: None,
       should_succeed: true,
   },
   ```
4. **Implement the test function**:
   ```rust
   fn test_new_operation(env: &Env, caller: &Address) -> Result<(), crate::errors::RustAcademyError> {
       RustAcademyContract::new_operation(env.clone(), caller.clone(), ...)
   }
   ```
5. **Run the guard tests** to ensure your entry point is covered:
   ```bash
   cargo test guard_test
   ```

## Emergency Mode Behavior

Emergency mode is an irreversible state that blocks most mutating operations but allows withdrawals:

**Blocked by emergency mode:**
- All deposit operations
- Admin configuration operations
- Feature pause/unpause operations

**NOT blocked by emergency mode:**
- Withdrawal operations (users must be able to access funds)
- Refund operations
- Dispute resolution

This design ensures that users can always withdraw their funds even during emergencies, while preventing new deposits and configuration changes.

## Testing

The contract includes a comprehensive table-driven test suite in `guard_test.rs` that verifies:

1. All mutating entry points work under normal conditions
2. Emergency mode blocks appropriate operations
3. Global pause blocks operations
4. Uninitialized contract blocks operations
5. Each entry point has explicit guard coverage

Run the guard tests:
```bash
cargo test guard_test
```

## Checklist for Review

When reviewing a PR that adds or modifies a mutating entry point:

- [ ] Does the entry point use an appropriate guard helper?
- [ ] Is the guard called at the beginning of the function?
- [ ] Is there a test case in `GUARD_TEST_TABLE`?
- [ ] Does the test case verify the guard behavior?
- [ ] Is the guard behavior documented in the function's docstring?
- [ ] Does the guard match the operation type (deposit, withdraw, admin config, etc.)?

## Guard Coverage Matrix

| Entry Point | Guard Used | Emergency Mode | Global Pause | Feature Pause | Reentrancy | Initialization |
|-------------|------------|----------------|--------------|---------------|------------|----------------|
| deposit | guard_deposit | ✅ | ✅ | ✅ | ✅ | ❌ |
| deposit_with_commitment | guard_deposit | ✅ | ✅ | ✅ | ✅ | ❌ |
| deposit_partial | guard_deposit | ✅ | ✅ | ✅ | ✅ | ❌ |
| partial_payment | guard_deposit | ✅ | ✅ | ✅ | ✅ | ❌ |
| withdraw | guard_withdraw | ❌ | ✅ | ✅ | ✅ | ❌ |
| refund | guard_refund | ❌ | ✅ | ✅ | ✅ | ❌ |
| dispute | guard_dispute | ❌ | ✅ | ❌ | ✅ | ❌ |
| resolve_dispute | guard_dispute | ❌ | ✅ | ❌ | ✅ | ❌ |
| vote_for_dispute | guard_dispute | ❌ | ✅ | ❌ | ✅ | ❌ |
| resolve_dispute_multi_sig | guard_dispute | ❌ | ✅ | ❌ | ✅ | ❌ |
| set_privacy | guard_initialized | ❌ | ❌ | ✅ | ✅ | ✅ |
| cleanup_escrow | guard_initialized | ❌ | ❌ | ❌ | ✅ | ✅ |
| extend_escrow_ttl | guard_initialized | ❌ | ❌ | ❌ | ✅ | ✅ |
| register_hook | guard_initialized | ❌ | ❌ | ❌ | ✅ | ✅ |
| unregister_hook | guard_initialized | ❌ | ❌ | ❌ | ✅ | ✅ |
| set_paused | guard_admin_config | ✅ | ❌ | ❌ | ✅ | ❌ |
| pause_features | guard_admin_config | ✅ | ❌ | ❌ | ✅ | ❌ |
| unpause_features | guard_admin_config | ✅ | ❌ | ❌ | ✅ | ❌ |
| set_admin | guard_admin_config | ✅ | ❌ | ❌ | ✅ | ❌ |
| set_fee_config | guard_admin_config | ✅ | ❌ | ❌ | ✅ | ❌ |
| set_per_asset_fee | guard_admin_config | ✅ | ❌ | ❌ | ✅ | ❌ |
| set_oracle_fee_config | guard_admin_config | ✅ | ❌ | ❌ | ✅ | ❌ |
| set_platform_wallet | guard_admin_config | ✅ | ❌ | ❌ | ✅ | ❌ |
| rotate_fee_collector | guard_admin_config | ✅ | ❌ | ❌ | ✅ | ❌ |
| register_ephemeral_key | guard_stealth | ❌ | ✅ | ✅ | ✅ | ❌ |
| stealth_withdraw | guard_stealth | ❌ | ✅ | ✅ | ✅ | ❌ |
