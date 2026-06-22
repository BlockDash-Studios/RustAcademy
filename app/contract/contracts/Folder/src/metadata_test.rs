//! # Deployment Metadata Tests — Issue #430
//!
//! Validates the `get_deployment_metadata` view entry point:
//! - Correct values on a fresh deployment.
//! - `wasm_hash` is populated after `upgrade()`.
//! - Metadata is network- and contract-bound via `contract_id`.
//! - Golden tests for response schema stability across upgrades.

use crate::{
    events::EVENT_SCHEMA_VERSION,
    storage::{self, CURRENT_CONTRACT_VERSION, LEGACY_CONTRACT_VERSION},
    types::{
        ContractHealth, DeploymentMetadata, FeatureFlags, SchemaCompatibility,
        SupportedVersions, UpgradeState,
    },
     PauseFlag, RustAcademyContract, RustAcademyContractClient,
};
use soroban_sdk::{testutils::Address as _, testutils::Ledger, Address, BytesN, Env, Symbol};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn setup() -> (Env,  RustAcademyContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register( RustAcademyContract, ());
    let client =  RustAcademyContractClient::new(&env, &contract_id);
    (env, client)
}

// ---------------------------------------------------------------------------
// Basic correctness
// ---------------------------------------------------------------------------

#[test]
fn metadata_fresh_deployment_has_correct_versions() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let meta = client.get_deployment_metadata();

    assert_eq!(meta.contract_version, CURRENT_CONTRACT_VERSION);
    assert_eq!(meta.event_schema_version, EVENT_SCHEMA_VERSION);
    assert!(meta.wasm_hash.is_none());
}

#[test]
fn metadata_contract_id_matches_invoked_address() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let meta = client.get_deployment_metadata();

    assert_eq!(meta.contract_id, client.address);
}

/// Verify wasm_hash is stored by directly writing via storage (bypasses
/// `update_current_contract_wasm` which requires a real uploaded WASM in tests).
#[test]
fn metadata_wasm_hash_populated_after_upgrade() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let new_hash = BytesN::from_array(&env, &[0xabu8; 32]);
    env.as_contract(&client.address, || {
        storage::set_wasm_hash(&env, &new_hash);
    });

    let meta = client.get_deployment_metadata();
    assert_eq!(meta.wasm_hash, Some(new_hash));
}

#[test]
fn metadata_wasm_hash_updated_on_second_upgrade() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let hash_v1 = BytesN::from_array(&env, &[0x01u8; 32]);
    let hash_v2 = BytesN::from_array(&env, &[0x02u8; 32]);

    env.as_contract(&client.address, || {
        storage::set_wasm_hash(&env, &hash_v1);
        storage::set_wasm_hash(&env, &hash_v2);
    });

    let meta = client.get_deployment_metadata();
    assert_eq!(meta.wasm_hash, Some(hash_v2));
}

// ---------------------------------------------------------------------------
// Network / domain binding
// ---------------------------------------------------------------------------

#[test]
fn metadata_contract_id_differs_across_deployments() {
    // Two independent deployments must report different contract_ids,
    // ensuring metadata is bound to a specific deployment and network slot.
    let env = Env::default();
    env.mock_all_auths();

    let id_a = env.register( RustAcademyContract, ());
    let id_b = env.register( RustAcademyContract, ());

    let client_a =  RustAcademyContractClient::new(&env, &id_a);
    let client_b =  RustAcademyContractClient::new(&env, &id_b);

    let admin = Address::generate(&env);
    client_a.initialize(&admin);
    client_b.initialize(&admin);

    let meta_a = client_a.get_deployment_metadata();
    let meta_b = client_b.get_deployment_metadata();

    assert_ne!(meta_a.contract_id, meta_b.contract_id);
}

// ---------------------------------------------------------------------------
// Upgrade migration — versions remain correct after migrate()
// ---------------------------------------------------------------------------

#[test]
fn metadata_versions_stable_after_migrate() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    // Simulate a stored wasm_hash (as upgrade() would set) then run migration.
    let new_hash = BytesN::from_array(&env, &[0xffu8; 32]);
    env.as_contract(&client.address, || {
        storage::set_wasm_hash(&env, &new_hash);
    });
    client.migrate(&admin);

    let meta = client.get_deployment_metadata();
    assert_eq!(meta.contract_version, CURRENT_CONTRACT_VERSION);
    assert_eq!(meta.event_schema_version, EVENT_SCHEMA_VERSION);
    assert_eq!(meta.wasm_hash, Some(new_hash));
}

// ---------------------------------------------------------------------------
// Golden tests — response schema stability
// ---------------------------------------------------------------------------

/// Golden test: field names and types of DeploymentMetadata must not change.
///
/// If a field is renamed, removed, or its type changes, this test will fail
/// to compile, catching accidental breaking changes before they reach production.
#[test]
fn golden_deployment_metadata_schema_is_stable() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register( RustAcademyContract, ());
    let client =  RustAcademyContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let hash = BytesN::from_array(&env, &[0x42u8; 32]);
    env.as_contract(&contract_id, || {
        storage::set_wasm_hash(&env, &hash);
    });

    let meta: DeploymentMetadata = client.get_deployment_metadata();

    // Assert field presence and types (compile-time + runtime).
    let _cv: u32 = meta.contract_version;
    let _esv: u32 = meta.event_schema_version;
    let _wh: Option<BytesN<32>> = meta.wasm_hash;
    let _cid: Address = meta.contract_id;

    assert_eq!(_cv, CURRENT_CONTRACT_VERSION);
    assert_eq!(_esv, EVENT_SCHEMA_VERSION);
    assert_eq!(_wh, Some(hash));
    assert_eq!(_cid, contract_id);
}

/// Golden test: metadata returned without an upgrade must have a stable shape.
#[test]
fn golden_deployment_metadata_no_upgrade_schema_is_stable() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register( RustAcademyContract, ());
    let client =  RustAcademyContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let meta: DeploymentMetadata = client.get_deployment_metadata();

    assert_eq!(meta.contract_version, CURRENT_CONTRACT_VERSION);
    assert_eq!(meta.event_schema_version, EVENT_SCHEMA_VERSION);
    assert_eq!(meta.wasm_hash, None);
    assert_eq!(meta.contract_id, contract_id);
}

// ---------------------------------------------------------------------------
// Issue #50: built-in health checks and self-describing metadata
// ---------------------------------------------------------------------------

#[test]
fn metadata_contract_health_healthy_by_default() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let health = client.get_contract_health();
    assert_eq!(health.status, Symbol::new(&env, "healthy"));
    assert!(!health.paused);
    assert!(!health.emergency_mode);
    assert!(!health.upgrade_in_progress);
}

#[test]
fn metadata_contract_health_reports_paused() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    client.set_paused(&admin, &true);

    let health = client.get_contract_health();
    assert_eq!(health.status, Symbol::new(&env, "paused"));
    assert!(health.paused);
    assert!(!health.emergency_mode);
    assert!(!health.upgrade_in_progress);
}

#[test]
fn metadata_contract_health_reports_emergency_mode() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    client.activate_emergency_mode(&admin);

    let health = client.get_contract_health();
    assert_eq!(health.status, Symbol::new(&env, "emergency"));
    assert!(health.emergency_mode);
    // emergency_mode takes precedence over paused/upgrading.
}

#[test]
fn metadata_contract_health_reports_upgrading() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let new_hash = BytesN::from_array(&env, &[0x01u8; 32]);
    env.ledger().set_timestamp(100);
    let now = env.ledger().timestamp();
    client.set_upgrade_window(&admin, &now, &(now + 1000));
    client.start_upgrade(&admin, &2u32, &new_hash);

    let health = client.get_contract_health();
    assert_eq!(health.status, Symbol::new(&env, "upgrading"));
    assert!(health.upgrade_in_progress);
    assert!(!health.paused);
    assert!(!health.emergency_mode);
}

#[test]
fn metadata_feature_flags_all_enabled() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let flags: FeatureFlags = client.get_feature_flags();
    assert!(flags.upgrade_gating);
    assert!(flags.privacy);
    assert!(flags.partial_payment);
    assert!(flags.stealth);
    assert!(flags.fee_router);
    assert!(flags.oracle_fees);
    assert!(flags.hooks);
}

#[test]
fn metadata_upgrade_state_default_is_idle() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let state: UpgradeState = client.get_upgrade_state();
    assert!(!state.in_progress);
    assert!(state.pending_version.is_none());
    assert!(state.pending_wasm_hash.is_none());
    assert!(!state.window_active);
    assert_eq!(state.window_start, 0);
    assert_eq!(state.window_end, 0);
}

#[test]
fn metadata_upgrade_state_after_start_upgrade() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let new_hash = BytesN::from_array(&env, &[0x02u8; 32]);
    env.ledger().set_timestamp(100);
    let now = env.ledger().timestamp();
    let start = now;
    let end = now + 1000;
    client.set_upgrade_window(&admin, &start, &end);
    client.start_upgrade(&admin, &2u32, &new_hash);

    let state: UpgradeState = client.get_upgrade_state();
    assert!(state.in_progress);
    assert_eq!(state.pending_version, Some(2u32));
    assert_eq!(state.pending_wasm_hash, Some(new_hash));
    assert!(state.window_active);
    assert_eq!(state.window_start, start);
    assert_eq!(state.window_end, end);
}

#[test]
fn metadata_supported_versions_match_build() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let versions: SupportedVersions = client.get_supported_versions();
    assert_eq!(versions.contract_version, CURRENT_CONTRACT_VERSION);
    assert_eq!(versions.event_schema_version, EVENT_SCHEMA_VERSION);
    assert_eq!(versions.min_contract_version, LEGACY_CONTRACT_VERSION);
    assert_eq!(versions.min_event_schema_version, 1);
    assert_eq!(versions.supported_event_versions.len(), 2);
    assert_eq!(versions.supported_event_versions.get(0).unwrap(), 1);
    assert_eq!(
        versions.supported_event_versions.get(1).unwrap(),
        EVENT_SCHEMA_VERSION
    );
}

#[test]
fn metadata_schema_compatibility_matches_current_versions() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let compat: SchemaCompatibility = client.check_schema_compatibility(
        &CURRENT_CONTRACT_VERSION,
        &EVENT_SCHEMA_VERSION,
    );
    assert!(compat.contract_compatible);
    assert!(compat.event_compatible);
    assert!(compat.overall_compatible);
    assert_eq!(compat.current_contract, CURRENT_CONTRACT_VERSION);
    assert_eq!(compat.current_event, EVENT_SCHEMA_VERSION);
    assert_eq!(compat.requested_contract, CURRENT_CONTRACT_VERSION);
    assert_eq!(compat.requested_event, EVENT_SCHEMA_VERSION);
}

#[test]
fn metadata_schema_compatibility_rejects_unknown_versions() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let compat: SchemaCompatibility =
        client.check_schema_compatibility(&(CURRENT_CONTRACT_VERSION + 1), &(EVENT_SCHEMA_VERSION + 1));
    assert!(!compat.contract_compatible);
    assert!(!compat.event_compatible);
    assert!(!compat.overall_compatible);
}

#[test]
fn metadata_pause_flags_default_zero_and_after_pause() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    assert_eq!(client.get_pause_flags(), 0u64);

    client.pause_features(&admin, &(PauseFlag::Deposit as u64));
    assert_eq!(client.get_pause_flags(), PauseFlag::Deposit as u64);
}

/// Golden test: ContractHealth schema is stable.
#[test]
fn golden_contract_health_schema_is_stable() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let health: ContractHealth = client.get_contract_health();
    let _status: Symbol = health.status;
    let _paused: bool = health.paused;
    let _emergency: bool = health.emergency_mode;
    let _upgrading: bool = health.upgrade_in_progress;
}

/// Golden test: FeatureFlags schema is stable.
#[test]
fn golden_feature_flags_schema_is_stable() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let flags: FeatureFlags = client.get_feature_flags();
    let _upgrade_gating: bool = flags.upgrade_gating;
    let _privacy: bool = flags.privacy;
    let _partial_payment: bool = flags.partial_payment;
    let _stealth: bool = flags.stealth;
    let _fee_router: bool = flags.fee_router;
    let _oracle_fees: bool = flags.oracle_fees;
    let _hooks: bool = flags.hooks;
}

/// Golden test: UpgradeState schema is stable.
#[test]
fn golden_upgrade_state_schema_is_stable() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let state: UpgradeState = client.get_upgrade_state();
    let _in_progress: bool = state.in_progress;
    let _pending_version: Option<u32> = state.pending_version;
    let _pending_hash: Option<BytesN<32>> = state.pending_wasm_hash;
    let _window_active: bool = state.window_active;
    let _window_start: u64 = state.window_start;
    let _window_end: u64 = state.window_end;
}

/// Golden test: SchemaCompatibility schema is stable.
#[test]
fn golden_schema_compatibility_schema_is_stable() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let compat: SchemaCompatibility = client.check_schema_compatibility(&1, &1);
    let _contract_compatible: bool = compat.contract_compatible;
    let _event_compatible: bool = compat.event_compatible;
    let _overall_compatible: bool = compat.overall_compatible;
    let _current_contract: u32 = compat.current_contract;
    let _current_event: u32 = compat.current_event;
    let _requested_contract: u32 = compat.requested_contract;
    let _requested_event: u32 = compat.requested_event;
}

/// Golden test: SupportedVersions schema is stable.
#[test]
fn golden_supported_versions_schema_is_stable() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let versions: SupportedVersions = client.get_supported_versions();
    let _contract_version: u32 = versions.contract_version;
    let _event_schema_version: u32 = versions.event_schema_version;
    let _min_contract_version: u32 = versions.min_contract_version;
    let _min_event_schema_version: u32 = versions.min_event_schema_version;
    let _supported_event_versions: soroban_sdk::Vec<u32> = versions.supported_event_versions;
}
