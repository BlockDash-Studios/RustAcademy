use crate::errors::RustAcademyError;
use crate::events::{
    publish_admin_changed, publish_contract_initialized, publish_contract_migrated,
    publish_contract_paused, publish_fee_collector_rotated, publish_per_asset_fee_set,
    publish_upgrade_completed, publish_upgrade_started,
};
use crate::fee_router;
use crate::storage;
use crate::types::{FeeConfig, PerAssetFeeConfig, Role};
use soroban_sdk::{Address, BytesN, Env, Vec};

/// Initialize the contract with an admin address.
///
/// This is a one-time operation; subsequent calls fail with [`AlreadyInitialized`].
/// The initial admin is assigned the [`Role::Admin`] role.
pub fn initialize(env: &Env, admin: Address) -> Result<(), RustAcademyError> {
    if storage::is_initialized(env) || has_admin(env) {
        return Err(RustAcademyError::AlreadyInitialized);
    }

    // Set initial admin address (singleton for compatibility).
    storage::set_admin(env, &admin);
    storage::set_paused(env, false);
    storage::set_contract_version(env, storage::CURRENT_CONTRACT_VERSION);

    // Grant Admin role to the initial administrator.
    let mut roles = Vec::new(env);
    roles.push_back(Role::Admin);
    storage::set_roles(env, &admin, &roles);

    // Mark the contract initialized only after all initialization writes succeed.
    storage::set_initialized(env, true);

    // Emit the initialization snapshot for indexers.
    publish_contract_initialized(
        env,
        admin,
        storage::CURRENT_CONTRACT_VERSION,
        crate::events::EVENT_SCHEMA_VERSION,
        false,
    );

    Ok(())
}

/// Check if admin has been initialized.
pub fn has_admin(env: &Env) -> bool {
    storage::get_admin(env).is_some()
}

/// Require that one-time contract initialization has completed.
pub fn require_initialized(env: &Env) -> Result<(), RustAcademyError> {
    if storage::is_initialized(env) {
        Ok(())
    } else {
        Err(RustAcademyError::Unauthorized)
    }
}

/// Get the current primary admin address.
pub fn get_admin(env: &Env) -> Option<Address> {
    storage::get_admin(env)
}

/// Check if an address has a specific role.
pub fn has_role(env: &Env, address: &Address, role: Role) -> bool {
    let roles = storage::get_roles(env, address);
    roles.contains(role)
}

fn current_admin(env: &Env) -> Result<Address, RustAcademyError> {
    let admin = storage::get_admin(env).ok_or(RustAcademyError::InvalidRoleState)?;
    let roles = storage::get_roles(env, &admin);
    if roles.contains(Role::Admin) {
        Ok(admin)
    } else {
        Err(RustAcademyError::InvalidRoleState)
    }
}

fn apply_admin_transfer(env: &Env, old_admin: &Address, new_admin: &Address) {
    storage::set_admin(env, new_admin);
    storage::clear_pending_admin_transfer(env);

    let old_roles = storage::get_roles(env, old_admin);
    let mut filtered_old_roles = Vec::new(env);
    for role in old_roles {
        if role != Role::Admin {
            filtered_old_roles.push_back(role);
        }
    }
    storage::set_roles(env, old_admin, &filtered_old_roles);

    let mut new_roles = storage::get_roles(env, new_admin);
    if !new_roles.contains(Role::Admin) {
        new_roles.push_back(Role::Admin);
        storage::set_roles(env, new_admin, &new_roles);
    }

    publish_admin_changed(env, old_admin.clone(), new_admin.clone());
}

/// Require that the caller has at least one of the specified roles.
pub fn require_any_role(
    env: &Env,
    caller: &Address,
    roles: &[Role],
) -> Result<(), RustAcademyError> {
    require_initialized(env)?;

    caller.require_auth();
    let _ = current_admin(env)?;
    let user_roles = storage::get_roles(env, caller);
    for role in roles {
        if user_roles.contains(*role) {
            return Ok(());
        }
    }
    Err(RustAcademyError::InsufficientRole)
}

/// Require that the caller is an Admin.
pub fn require_admin(env: &Env, caller: &Address) -> Result<(), RustAcademyError> {
    require_any_role(env, caller, &[Role::Admin])
}

/// Grant a role to an address (**Admin only**).
pub fn grant_role(
    env: &Env,
    caller: Address,
    target: Address,
    role: Role,
) -> Result<(), RustAcademyError> {
    require_admin(env, &caller)?;
    let admin = current_admin(env)?;

    if target == admin && role == Role::Admin {
        return Err(RustAcademyError::InvalidRoleState);
    }

    let mut roles = storage::get_roles(env, &target);
    if !roles.contains(role) {
        roles.push_back(role);
        storage::set_roles(env, &target, &roles);
    }
    Ok(())
}

/// Revoke a role from an address (**Admin only**).
pub fn revoke_role(
    env: &Env,
    caller: Address,
    target: Address,
    role: Role,
) -> Result<(), RustAcademyError> {
    require_admin(env, &caller)?;
    let admin = current_admin(env)?;

    if target == admin && role == Role::Admin {
        return Err(RustAcademyError::InvalidRoleState);
    }

    let roles = storage::get_roles(env, &target);
    let mut new_roles = Vec::new(env);
    for r in roles {
        if r != role {
            new_roles.push_back(r);
        }
    }
    storage::set_roles(env, &target, &new_roles);
    Ok(())
}

/// Set a new primary admin address (**Admin only**).
pub fn set_admin(env: &Env, caller: Address, new_admin: Address) -> Result<(), RustAcademyError> {
    require_admin(env, &caller)?;
    let old_admin = current_admin(env)?;

    if old_admin == new_admin {
        storage::clear_pending_admin_transfer(env);
        return Ok(());
    }

    apply_admin_transfer(env, &old_admin, &new_admin);
    Ok(())
}

/// Propose an admin transfer that must later be accepted by the target.
pub fn propose_admin_transfer(
    env: &Env,
    caller: Address,
    new_admin: Address,
) -> Result<(), RustAcademyError> {
    require_admin(env, &caller)?;
    let admin = current_admin(env)?;

    if admin == new_admin {
        storage::clear_pending_admin_transfer(env);
        return Ok(());
    }

    storage::set_pending_admin_transfer(env, &new_admin);
    Ok(())
}

/// Accept the currently pending admin transfer.
pub fn accept_admin_transfer(env: &Env, caller: Address) -> Result<(), RustAcademyError> {
    caller.require_auth();
    let new_admin =
        storage::get_pending_admin_transfer(env).ok_or(RustAcademyError::NoPendingAdminTransfer)?;
    if caller != new_admin {
        return Err(RustAcademyError::InsufficientRole);
    }

    let old_admin = current_admin(env)?;
    if old_admin == new_admin {
        storage::clear_pending_admin_transfer(env);
        return Ok(());
    }

    apply_admin_transfer(env, &old_admin, &new_admin);
    Ok(())
}

/// Cancel the pending admin transfer.
pub fn cancel_admin_transfer(env: &Env, caller: Address) -> Result<(), RustAcademyError> {
    require_admin(env, &caller)?;
    if storage::get_pending_admin_transfer(env).is_none() {
        return Err(RustAcademyError::NoPendingAdminTransfer);
    }

    storage::clear_pending_admin_transfer(env);
    Ok(())
}

/// Remove all roles from an account.
pub fn clear_roles(env: &Env, caller: Address, target: Address) -> Result<(), RustAcademyError> {
    require_admin(env, &caller)?;
    let admin = current_admin(env)?;

    if target == admin {
        let mut roles = Vec::new(env);
        roles.push_back(Role::Admin);
        storage::set_roles(env, &target, &roles);
        return Ok(());
    }

    let new_roles = Vec::new(env);
    storage::set_roles(env, &target, &new_roles);
    Ok(())
}

/// Set the paused state (**Admin or Operator only**).
pub fn set_paused(env: &Env, caller: Address, new_state: bool) -> Result<(), RustAcademyError> {
    require_any_role(env, &caller, &[Role::Admin, Role::Operator])?;

    storage::set_paused(env, new_state);
    publish_contract_paused(env, caller, new_state);
    Ok(())
}

/// Check if the contract is paused.
pub fn is_paused(env: &Env) -> bool {
    storage::is_paused(env)
}

pub fn get_version(env: &Env) -> u32 {
    storage::get_contract_version(env).unwrap_or(storage::LEGACY_CONTRACT_VERSION)
}

pub fn migrate(env: &Env, caller: &Address) -> Result<u32, RustAcademyError> {
    let from_version = get_version(env);
    if from_version == storage::LEGACY_CONTRACT_VERSION {
        caller.require_auth();

        let admin = storage::get_admin(env).ok_or(RustAcademyError::Unauthorized)?;
        if admin != *caller {
            return Err(RustAcademyError::InsufficientRole);
        }

        // Legacy deployments may not have role assignments. Seed Admin role so
        // post-migration admin checks continue to work.
        let mut roles = storage::get_roles(env, caller);
        if !roles.contains(Role::Admin) {
            roles.push_back(Role::Admin);
            storage::set_roles(env, caller, &roles);
        }
    } else {
        require_admin(env, caller)?;
    }

    if from_version > storage::CURRENT_CONTRACT_VERSION {
        return Err(RustAcademyError::InvalidContractVersion);
    }

    let mut version = from_version;
    while version < storage::CURRENT_CONTRACT_VERSION {
        version = match version {
            storage::LEGACY_CONTRACT_VERSION => migrate_legacy_to_v1(env),
            _ => return Err(RustAcademyError::InvalidContractVersion),
        };
    }

    if version != from_version {
        publish_contract_migrated(env, caller, from_version, version);
    }

    // Post-upgrade invariant checks (Issue #432)
    if let Err(_msg) = storage::assert_post_upgrade_invariants(env) {
        env.panic_with_error(RustAcademyError::InternalError);
    }

    Ok(version)
}

fn migrate_legacy_to_v1(env: &Env) -> u32 {
    storage::set_contract_version(env, storage::CURRENT_CONTRACT_VERSION);
    storage::set_initialized(env, true);

    // Migrate FeeConfig schema version if it exists
    let key = storage::DataKey::FeeConfig;
    if let Some(mut fee_cfg) = env.storage().persistent().get(&key) {
        storage::migrate_fee_config(&mut fee_cfg);
        env.storage().persistent().set(&key, &fee_cfg);
        storage::set_or_extend_ttl(env, &key, storage::RecordType::FeeConfig);
    }

    // Migrate OracleFeeConfig schema version if it exists
    let key = storage::DataKey::OracleFeeConfig;
    if let Some(mut oracle_cfg) = env.storage().persistent().get(&key) {
        storage::migrate_oracle_fee_config(&mut oracle_cfg);
        env.storage().persistent().set(&key, &oracle_cfg);
        storage::set_or_extend_ttl(env, &key, storage::RecordType::FeeConfig);
    }

    // Note: EscrowEntry and StealthEscrowEntry records are migrated on-read
    // via the schema_version field check in get_escrow/get_stealth_escrow.
    // PerAssetFeeConfig records are migrated on-write via set_per_asset_fee.

    storage::CURRENT_CONTRACT_VERSION
}

// ─────────────────────────────────────────────────────────────────────────
// Upgrade Gating (Issue #432)
// ─────────────────────────────────────────────────────────────────────────

/// Set the upgrade window during which upgrades are permitted.
///
/// **Admin only**. Define `[start, end)` epoch seconds:
/// - `start` = 0: no window set (upgrades blocked)
/// - `end` = 0: no upper bound (upgrades allowed from start onwards)
pub fn set_upgrade_window(
    env: &Env,
    caller: &Address,
    start: u64,
    end: u64,
) -> Result<(), RustAcademyError> {
    require_admin(env, caller)?;
    storage::set_upgrade_window(env, start, end);
    crate::events::publish_upgrade_window_set(env, caller.clone(), start, end);
    Ok(())
}

/// Start an upgrade (enters gating state; requires active window).
///
/// **Admin only**. Emits `UpgradeStarted` event with old/new versions.
/// Blocks if window is not active or upgrade already in progress.
pub fn start_upgrade(
    env: &Env,
    caller: &Address,
    new_version: u32,
    new_wasm_hash: BytesN<32>,
) -> Result<(), RustAcademyError> {
    require_admin(env, caller)?;

    // Check upgrade gate master switch (Issue #318)
    if !storage::is_upgrade_gate_enabled(env) {
        return Err(RustAcademyError::UpgradeWindowNotActive);
    }

    // Check upgrade window is active (Issue #432 AC1)
    if !storage::is_upgrade_window_active(env) {
        return Err(RustAcademyError::UpgradeWindowNotActive);
    }

    if storage::is_upgrade_in_progress(env) {
        return Err(RustAcademyError::UpgradeAlreadyInProgress);
    }

    let old_version = get_version(env);
    let (window_start, window_end) = storage::get_upgrade_window(env);
    if let Some(current_hash) = storage::get_wasm_hash(env) {
        storage::set_pending_upgrade_rollback_wasm_hash(env, &current_hash);
    } else {
        storage::clear_pending_upgrade_rollback_wasm_hash(env);
    }

    storage::set_upgrade_in_progress(env, true);
    storage::set_pending_upgrade_version(env, new_version);
    storage::set_pending_upgrade_wasm_hash(env, &new_wasm_hash);

    publish_upgrade_started(
        env,
        caller,
        old_version,
        new_version,
        new_wasm_hash,
        window_start,
        window_end,
    );

    Ok(())
}

/// Perform the WASM swap (**Admin only**).
///
/// Must be called during an active upgrade window and while an upgrade is in progress.
/// The provided WASM hash must match the one recorded during `start_upgrade`.
pub fn upgrade(
    env: &Env,
    caller: &Address,
    new_wasm_hash: BytesN<32>,
) -> Result<(), RustAcademyError> {
    require_admin(env, caller)?;

    if !storage::is_upgrade_in_progress(env) {
        return Err(RustAcademyError::UpgradeNotInProgress);
    }

    if !storage::is_upgrade_window_active(env) {
        return Err(RustAcademyError::UpgradeWindowNotActive);
    }

    let pending_hash =
        storage::get_pending_upgrade_wasm_hash(env).ok_or(RustAcademyError::InternalError)?;

    if new_wasm_hash != pending_hash {
        return Err(RustAcademyError::CommitmentMismatch);
    }

    storage::set_wasm_hash(env, &new_wasm_hash);

    // Skip actual WASM update in test mode, since we don't have a registered hash to use
    #[cfg(not(test))]
    env.deployer()
        .update_current_contract_wasm(new_wasm_hash.clone());

    crate::events::publish_contract_upgraded(env, new_wasm_hash, caller);

    Ok(())
}

/// Cancel a pending upgrade and clear gating state (**Admin only**).
pub fn cancel_upgrade(env: &Env, caller: &Address) -> Result<(), RustAcademyError> {
    require_admin(env, caller)?;
    if let Some(rollback_hash) = storage::get_pending_upgrade_rollback_wasm_hash(env) {
        storage::set_wasm_hash(env, &rollback_hash);

        #[cfg(not(test))]
        env.deployer()
            .update_current_contract_wasm(rollback_hash.clone());
    }
    storage::clear_pending_upgrade(env);
    Ok(())
}

/// Complete an upgrade (migrate state, update version, emit event).
///
/// **Admin only**. Must be called after `start_upgrade` and `upgrade` to finalize.
/// Calls `migrate()` internally and re-checks invariants.
pub fn complete_upgrade(
    env: &Env,
    caller: &Address,
    new_version: u32,
) -> Result<u32, RustAcademyError> {
    if !storage::is_upgrade_in_progress(env) {
        return Err(RustAcademyError::UpgradeNotInProgress);
    }

    // Verify version and hash (Issue #432 AC2)
    let pending_version =
        storage::get_pending_upgrade_version(env).ok_or(RustAcademyError::InternalError)?;
    let pending_hash =
        storage::get_pending_upgrade_wasm_hash(env).ok_or(RustAcademyError::InternalError)?;

    if new_version != pending_version && new_version != 0 {
        return Err(RustAcademyError::InvalidContractVersion);
    }

    // Verify currently running WASM matches pending hash
    // Note: in Soroban, we can't directly check the current WASM hash from within the contract
    // except by checking what we just stored in storage::set_wasm_hash during upgrade().
    let actual_hash = storage::get_wasm_hash(env).ok_or(RustAcademyError::InternalError)?;
    if actual_hash != pending_hash {
        return Err(RustAcademyError::InternalError);
    }

    let old_version = get_version(env);

    // Run migration
    let migrated_version = migrate(env, caller)?;

    // Ensure migrated version matches expected
    if migrated_version != pending_version && pending_version != 0 {
        return Err(RustAcademyError::InvalidContractVersion);
    }

    storage::clear_pending_upgrade(env);
    publish_upgrade_completed(env, caller, old_version, migrated_version);

    Ok(migrated_version)
}

/// Require that the contract is not paused.
#[allow(dead_code)]
pub fn require_not_paused(env: &Env) -> Result<(), RustAcademyError> {
    if is_paused(env) {
        return Err(RustAcademyError::ContractPaused);
    }
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────
// Shared Guard Helpers for Authorization Normalization
// ─────────────────────────────────────────────────────────────────────────

/// Require that the contract is not in emergency mode.
///
/// Emergency mode is an irreversible state that blocks most mutating operations.
/// Only admin can activate it via `activate_emergency_mode`.
pub fn require_not_emergency_mode(env: &Env) -> Result<(), RustAcademyError> {
    if storage::is_emergency_mode(env) {
        return Err(RustAcademyError::ContractPaused);
    }
    Ok(())
}

/// Require that the contract is not paused (global pause).
///
/// This is the global pause flag that blocks operations when set.
pub fn require_not_paused_global(env: &Env) -> Result<(), RustAcademyError> {
    if is_paused(env) {
        return Err(RustAcademyError::ContractPaused);
    }
    Ok(())
}

/// Require that a specific feature is not paused.
///
/// Checks the granular pause flags for specific operations.
pub fn require_feature_not_paused(env: &Env, flag: crate::storage::PauseFlag) -> Result<(), RustAcademyError> {
    if storage::is_feature_paused(env, flag) {
        return Err(RustAcademyError::OperationPaused);
    }
    Ok(())
}

/// Standard guard for user-initiated deposit operations.
///
/// Checks: emergency mode, global pause, feature pause, reentrancy.
pub fn guard_deposit(env: &Env, pause_flag: crate::storage::PauseFlag) -> Result<(), RustAcademyError> {
    require_not_emergency_mode(env)?;
    require_not_paused_global(env)?;
    require_feature_not_paused(env, pause_flag)?;
    crate::hook::assert_not_reentrant(env)?;
    Ok(())
}

/// Standard guard for withdrawal operations.
///
/// Checks: global pause, feature pause, reentrancy.
/// Note: Emergency mode does NOT block withdrawals (users need to access funds).
pub fn guard_withdraw(env: &Env, pause_flag: crate::storage::PauseFlag) -> Result<(), RustAcademyError> {
    require_not_paused_global(env)?;
    require_feature_not_paused(env, pause_flag)?;
    crate::hook::assert_not_reentrant(env)?;
    Ok(())
}

/// Standard guard for refund operations.
///
/// Checks: global pause, feature pause, reentrancy.
pub fn guard_refund(env: &Env, pause_flag: crate::storage::PauseFlag) -> Result<(), RustAcademyError> {
    require_not_paused_global(env)?;
    require_feature_not_paused(env, pause_flag)?;
    crate::hook::assert_not_reentrant(env)?;
    Ok(())
}

/// Standard guard for dispute operations.
///
/// Checks: global pause, reentrancy.
pub fn guard_dispute(env: &Env) -> Result<(), RustAcademyError> {
    require_not_paused_global(env)?;
    crate::hook::assert_not_reentrant(env)?;
    Ok(())
}

/// Standard guard for admin configuration operations.
///
/// Checks: emergency mode, reentrancy.
pub fn guard_admin_config(env: &Env) -> Result<(), RustAcademyError> {
    require_not_emergency_mode(env)?;
    crate::hook::assert_not_reentrant(env)?;
    Ok(())
}

/// Standard guard for operations that require initialization.
///
/// Checks: initialization, reentrancy.
pub fn guard_initialized(env: &Env) -> Result<(), RustAcademyError> {
    require_initialized(env)?;
    crate::hook::assert_not_reentrant(env)?;
    Ok(())
}

/// Standard guard for stealth address operations.
///
/// Checks: global pause, feature pause, reentrancy.
pub fn guard_stealth(env: &Env, pause_flag: crate::storage::PauseFlag) -> Result<(), RustAcademyError> {
    require_not_paused_global(env)?;
    require_feature_not_paused(env, pause_flag)?;
    crate::hook::assert_not_reentrant(env)?;
    Ok(())
}

/// Set granular pause flags (**Admin or Operator only**).
pub fn set_pause_flags(
    env: &Env,
    caller: &Address,
    flags_to_enable: u64,
    flags_to_disable: u64,
) -> Result<(), RustAcademyError> {
    require_any_role(env, caller, &[Role::Admin, Role::Operator])?;

    storage::set_pause_flags(env, caller, flags_to_enable, flags_to_disable);
    crate::events::publish_pause_flags_changed(env, caller.clone(), flags_to_enable, flags_to_disable);
    Ok(())
}

/// Set fee configuration (**Admin or Operator only**).
///
/// Sets the global fee applied to all tokens unless overridden by per-asset configuration.
/// Fee is expressed in basis points: 1 = 0.01%, 100 = 1%, 10000 = 100%.
///
/// This is a fallback; per-asset overrides (via [`set_per_asset_fee`]) take precedence.
///
/// # Arguments
/// * `env` - Contract environment
/// * `caller` - Address requesting the change (must have Admin or Operator role)
/// * `config` - New fee configuration
///
/// # Errors
/// - `InsufficientRole` if caller lacks required role
/// - `ContractPaused` if admin pause flag is enabled
pub fn set_fee_config(
    env: &Env,
    caller: &Address,
    config: FeeConfig,
) -> Result<(), RustAcademyError> {
    require_any_role(env, caller, &[Role::Admin, Role::Operator])?;

    storage::set_fee_config(env, &config);
    crate::events::publish_fee_config_changed(env, config.fee_bps);
    Ok(())
}

/// Set per-asset fee configuration for a specific token (**Admin or Operator only**).
///
/// Overrides the global fee for a specific token. Highest priority in fee resolution:
/// 1. Per-asset override (this) — if set
/// 2. Oracle dynamic pricing — if configured and fresh
/// 3. Global static fee — fallback
///
/// Setting `fee_bps = 0` explicitly disables fees for that token.
///
/// # Fee Splits
///
/// **Legacy (arbiter_bps)**: Simple percentage split
/// - `arbiter_bps > 0` → that % of fee goes to arbiter (if arbiter present in payout)
/// - Remainder to collector
///
/// **Explicit (FeeRatio)**: Fine-grained control
/// - Set `arbiter_fee`, `platform_fee`, or `collector_fee` with FeeRatio
/// - When any explicit ratio is set, legacy `arbiter_bps` is ignored
/// - Sum of ratios must not exceed 1.0
///
/// # Arguments
/// * `env` - Contract environment
/// * `caller` - Address requesting the change (must have Admin or Operator role)
/// * `token` - Token address to configure
/// * `config` - Per-asset fee configuration
///
/// # Errors
/// - `InsufficientRole` if caller lacks required role
/// - `InvalidAmount` if fee_bps or arbiter_bps > 10000
/// - `FeeSplitExceedsTotal` if explicit ratios sum to > 1.0
/// - Other validation errors from `PerAssetFeeConfig::validate()`
///
/// # Examples
/// Set 1.5% fee for USDC with no arbiter split:
/// ```ignore
/// set_per_asset_fee(env, caller, &usdc_token, &PerAssetFeeConfig {
///     fee_bps: 150,
///     arbiter_bps: 0,
///     ..Default::default()
/// })?;
/// ```
pub fn set_per_asset_fee(
    env: &Env,
    caller: &Address,
    token: Address,
    config: PerAssetFeeConfig,
) -> Result<(), RustAcademyError> {
    require_any_role(env, caller, &[Role::Admin, Role::Operator])?;

    if config.fee_bps > 10_000 || config.arbiter_bps > 10_000 {
        return Err(RustAcademyError::InvalidAmount);
    }
    config.validate()?;

    storage::set_per_asset_fee(env, &token, &config);
    publish_per_asset_fee_set(
        env,
        token,
        config.fee_bps,
        config.arbiter_bps,
        config.arbiter_fee,
        config.platform_fee,
        config.collector_fee,
    );
    Ok(())
}

pub fn set_oracle_fee_config(
    env: &Env,
    caller: &Address,
    config: crate::types::OracleFeeConfig,
) -> Result<(), RustAcademyError> {
    require_any_role(env, caller, &[Role::Admin, Role::Operator])?;

    storage::set_oracle_fee_config(env, &config);
    Ok(())
}

/// Set platform wallet address (**Admin only**).
pub fn set_platform_wallet(
    env: &Env,
    caller: &Address,
    wallet: Address,
) -> Result<(), RustAcademyError> {
    require_admin(env, caller)?;

    storage::set_platform_wallet(env, &wallet);
    crate::events::publish_platform_wallet_changed(env, wallet);
    Ok(())
}

/// Rotate active fee collector (**Admin only**).
pub fn rotate_fee_collector(
    env: &Env,
    caller: &Address,
    new_collector: Address,
) -> Result<u32, RustAcademyError> {
    require_admin(env, caller)?;

    let next_index = fee_router::rotate_collector(env, &new_collector);
    publish_fee_collector_rotated(env, new_collector, next_index);
    Ok(next_index)
}
