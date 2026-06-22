//! Built-in contract health checks and self-describing metadata (Issue #50).
//!
//! This module provides read-only views of the contract's runtime state for
//! tooling, backends, and indexers.  None of the functions here mutate storage.

use crate::{
    admin,
    events::{EVENT_REPLAY_FIELDS, EVENT_SCHEMA_VERSION},
    storage::{
        self, CURRENT_CONTRACT_VERSION, LEGACY_CONTRACT_VERSION,
    },
    types::{
        ContractHealth, DeploymentMetadata, FeatureFlags, SchemaCompatibility,
        SupportedVersions, UpgradeState,
    },
};
use soroban_sdk::{Env, Symbol, Vec};

/// Compile-time feature flags for this contract build.
///
/// These are stable constants because every feature is shipped in this WASM;
/// future releases may gate features behind storage or compile flags.
pub const FEATURE_UPGRADE_GATING: bool = true;
pub const FEATURE_PRIVACY: bool = true;
pub const FEATURE_PARTIAL_PAYMENT: bool = true;
pub const FEATURE_STEALTH: bool = true;
pub const FEATURE_FEE_ROUTER: bool = true;
pub const FEATURE_ORACLE_FEES: bool = true;
pub const FEATURE_HOOKS: bool = true;

/// Return deployment metadata for compatibility validation.
///
/// Clients and indexers can call this view (no auth required) to detect
/// version mismatches before interacting with the contract.
pub fn deployment_metadata(env: &Env) -> DeploymentMetadata {
    DeploymentMetadata {
        contract_version: admin::get_version(env),
        event_schema_version: EVENT_SCHEMA_VERSION,
        wasm_hash: storage::get_wasm_hash(env),
        contract_id: env.current_contract_address(),
    }
}

/// Return a non-mutating health summary of the contract.
///
/// The status is derived from pause, emergency, and upgrade flags.  It is
/// ordered from most to least severe: emergency > upgrading > paused > healthy.
pub fn contract_health(env: &Env) -> ContractHealth {
    let paused = storage::is_paused(env);
    let emergency_mode = storage::is_emergency_mode(env);
    let upgrade_in_progress = storage::is_upgrade_in_progress(env);

    let status = if emergency_mode {
        Symbol::new(env, "emergency")
    } else if upgrade_in_progress {
        Symbol::new(env, "upgrading")
    } else if paused {
        Symbol::new(env, "paused")
    } else {
        Symbol::new(env, "healthy")
    };

    ContractHealth {
        status,
        paused,
        emergency_mode,
        upgrade_in_progress,
    }
}

/// Return the feature flags supported by this contract build.
pub fn feature_flags() -> FeatureFlags {
    FeatureFlags {
        upgrade_gating: FEATURE_UPGRADE_GATING,
        privacy: FEATURE_PRIVACY,
        partial_payment: FEATURE_PARTIAL_PAYMENT,
        stealth: FEATURE_STEALTH,
        fee_router: FEATURE_FEE_ROUTER,
        oracle_fees: FEATURE_ORACLE_FEES,
        hooks: FEATURE_HOOKS,
    }
}

/// Return the state of the upgrade gating mechanism.
pub fn upgrade_state(env: &Env) -> UpgradeState {
    let (window_start, window_end) = storage::get_upgrade_window(env);
    UpgradeState {
        in_progress: storage::is_upgrade_in_progress(env),
        pending_version: storage::get_pending_upgrade_version(env),
        pending_wasm_hash: storage::get_pending_upgrade_wasm_hash(env),
        window_active: storage::is_upgrade_window_active(env),
        window_start,
        window_end,
    }
}

/// Return the supported version ranges for this contract build.
pub fn supported_versions(env: &Env) -> SupportedVersions {
    let mut supported_event_schema_versions = Vec::new(env);
    supported_event_schema_versions.push_back(1u32);
    supported_event_schema_versions.push_back(EVENT_SCHEMA_VERSION);

    SupportedVersions {
        contract_version: admin::get_version(env),
        event_schema_version: EVENT_SCHEMA_VERSION,
        min_contract_version: LEGACY_CONTRACT_VERSION,
        min_event_schema_version: 1,
        supported_event_versions: supported_event_schema_versions,
    }
}

/// Check whether a caller-supplied version pair is compatible with this deployment.
///
/// The contract version is compatible when it equals the current stored version
/// (migrations are required to move between contract versions).  The event
/// schema version is compatible when it is one of the versions emitted by this
/// build.
pub fn check_schema_compatibility(
    env: &Env,
    requested_contract_version: u32,
    requested_event_schema_version: u32,
) -> SchemaCompatibility {
    let current_contract_version = admin::get_version(env);
    let current_event_schema_version = EVENT_SCHEMA_VERSION;

    let contract_version_compatible = requested_contract_version == current_contract_version
        || (requested_contract_version >= LEGACY_CONTRACT_VERSION
            && requested_contract_version <= CURRENT_CONTRACT_VERSION);

    let event_schema_version_compatible = requested_event_schema_version == 1
        || requested_event_schema_version == current_event_schema_version;

    SchemaCompatibility {
        contract_compatible: contract_version_compatible,
        event_compatible: event_schema_version_compatible,
        overall_compatible: contract_version_compatible && event_schema_version_compatible,
        current_contract: current_contract_version,
        current_event: current_event_schema_version,
        requested_contract: requested_contract_version,
        requested_event: requested_event_schema_version,
    }
}

/// Return the current granular pause bitmask.
///
/// See [`crate::storage::PauseFlag`] for the bit definitions.  A value of `0`
/// means no features are paused.
pub fn pause_flags(env: &Env) -> u64 {
    let key = storage::DataKey::PauseFlags;
    env.storage().persistent().get(&key).unwrap_or(0)
}

/// Return the canonical replay metadata field names present in every v2+ event payload.
///
/// Backends ingesting contract events MUST record all of these fields alongside
/// the Horizon-provided `transaction_hash` and `paging_token` to form a complete
/// deduplication key that survives repeated or out-of-order event deliveries:
///
/// - `ledger_sequence`: the contract-reported ledger at emission time; backends
///   SHOULD cross-validate this against the Horizon-reported ledger to detect
///   tampered or mis-routed event payloads.
/// - `schema_version`: the event encoding version; parsers use this to select
///   the correct decoder.
/// - `timestamp`: the ledger close time in seconds since UNIX epoch.
pub fn event_replay_fields(env: &Env) -> Vec<Symbol> {
    let mut fields = Vec::new(env);
    for field in EVENT_REPLAY_FIELDS {
        fields.push_back(Symbol::new(env, field));
    }
    fields
}
