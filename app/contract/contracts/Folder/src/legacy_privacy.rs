//! # Legacy Boolean Privacy Storage
//!
//! Backward-compatible helpers for the original boolean `privacy_enabled` flag.
//!
//! ## Storage layout
//!
//! Two key formats coexist for historical reasons:
//!
//! | Key format                         | Value type | Era       |
//! |------------------------------------|------------|-----------|
//! | `(Symbol::new("privacy_enabled"), Address)` | `bool`     | Legacy    |
//! | `DataKey::PrivacyEnabled(Address)`| `bool`     | Current   |
//!
//! On every **write** the legacy symbol key is removed (if present) and the
//! typed key is used instead. On **read**, the typed key is checked first;
//! if absent the legacy key is used as a fallback.
//!
//! For the new `PrivacyLevel` (numeric) API see [`crate::privacy`].
//! For migration from boolean to level, see
//! [`crate::privacy::migrate_boolean_to_level`].

use crate::errors::RustAcademyError;
use crate::events::publish_privacy_toggled;
use crate::storage::{DataKey, PRIVACY_ENABLED_KEY};
use soroban_sdk::{Address, Env, Symbol};

/// Construct the legacy `(Symbol, Address)` storage key.
pub fn legacy_privacy_key(env: &Env, owner: &Address) -> (Symbol, Address) {
    (Symbol::new(env, PRIVACY_ENABLED_KEY), owner.clone())
}

/// Construct the typed `DataKey::PrivacyEnabled` storage key.
pub fn typed_privacy_key(owner: &Address) -> DataKey {
    DataKey::PrivacyEnabled(owner.clone())
}

/// Read the boolean privacy flag for `owner`, falling back from the typed
/// key to the legacy symbol key.
///
/// Returns `false` when neither key is set.
pub fn read_privacy_flag(env: &Env, owner: &Address) -> bool {
    let typed_key = typed_privacy_key(owner);
    if let Some(enabled) = env.storage().persistent().get(&typed_key) {
        return enabled;
    }

    env.storage()
        .persistent()
        .get(&legacy_privacy_key(env, owner))
        .unwrap_or(false)
}

/// Remove the legacy symbol key if present.
///
/// Called internally after a write to the typed key so that subsequent reads
/// go through the fast path.
pub fn cleanup_legacy_key(env: &Env, owner: &Address) {
    let legacy_key = legacy_privacy_key(env, owner);
    if env.storage().persistent().has(&legacy_key) {
        env.storage().persistent().remove(&legacy_key);
    }
}

/// Enable or disable privacy for an account (boolean API).
///
/// Reads the current state first and returns [`RustAcademyError::PrivacyAlreadySet`]
/// if the requested value matches the current value. Otherwise persists the new
/// state via the typed key, cleans up the legacy key, and publishes a
/// [`crate::events::publish_privacy_toggled`] event.
pub fn set_privacy(env: &Env, owner: Address, enabled: bool) -> Result<(), RustAcademyError> {
    owner.require_auth();

    let current = read_privacy_flag(env, &owner);
    if current == enabled {
        return Err(RustAcademyError::PrivacyAlreadySet);
    }

    let typed_key = typed_privacy_key(&owner);
    env.storage().persistent().set(&typed_key, &enabled);

    cleanup_legacy_key(env, &owner);

    publish_privacy_toggled(env, owner, enabled);
    Ok(())
}

/// Return the current boolean privacy state for an account.
///
/// Defaults to `false` if never set.
pub fn get_privacy(env: &Env, owner: Address) -> bool {
    read_privacy_flag(env, &owner)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    #[test]
    fn test_read_returns_false_when_unset() {
        let env = Env::default();
        let contract_id = env.register(crate::RustAcademyContract, ());
        let owner = Address::generate(&env);
        env.as_contract(&contract_id, || {
            assert!(!read_privacy_flag(&env, &owner));
        });
    }

    #[test]
    fn test_read_prefers_typed_key() {
        let env = Env::default();
        let contract_id = env.register(crate::RustAcademyContract, ());
        let owner = Address::generate(&env);
        env.as_contract(&contract_id, || {
            let typed_key = typed_privacy_key(&owner);
            env.storage().persistent().set(&typed_key, &true);
            assert!(read_privacy_flag(&env, &owner));
        });
    }

    #[test]
    fn test_read_falls_back_to_legacy_key() {
        let env = Env::default();
        let contract_id = env.register(crate::RustAcademyContract, ());
        let owner = Address::generate(&env);
        env.as_contract(&contract_id, || {
            let legacy_key = legacy_privacy_key(&env, &owner);
            env.storage().persistent().set(&legacy_key, &true);
            assert!(read_privacy_flag(&env, &owner));
        });
    }

    #[test]
    fn test_typed_key_takes_precedence_over_legacy() {
        let env = Env::default();
        let contract_id = env.register(crate::RustAcademyContract, ());
        let owner = Address::generate(&env);
        env.as_contract(&contract_id, || {
            let typed_key = typed_privacy_key(&owner);
            let legacy_key = legacy_privacy_key(&env, &owner);
            env.storage().persistent().set(&typed_key, &true);
            env.storage().persistent().set(&legacy_key, &false);
            assert!(read_privacy_flag(&env, &owner));
        });
    }

    #[test]
    fn test_cleanup_removes_legacy_key() {
        let env = Env::default();
        let contract_id = env.register(crate::RustAcademyContract, ());
        let owner = Address::generate(&env);
        env.as_contract(&contract_id, || {
            let legacy_key = legacy_privacy_key(&env, &owner);
            env.storage().persistent().set(&legacy_key, &true);
            assert!(env.storage().persistent().has(&legacy_key));
            cleanup_legacy_key(&env, &owner);
            assert!(!env.storage().persistent().has(&legacy_key));
        });
    }

    #[test]
    fn test_cleanup_is_idempotent_when_no_legacy_key() {
        let env = Env::default();
        let contract_id = env.register(crate::RustAcademyContract, ());
        let owner = Address::generate(&env);
        env.as_contract(&contract_id, || {
            cleanup_legacy_key(&env, &owner);
        });
    }

    /// Helper: write a raw boolean to the typed key (no auth, no event).
    /// Used by migration tests in `privacy::tests`.
    pub fn set_raw_privacy(env: &Env, owner: &Address, enabled: bool) {
        let typed_key = typed_privacy_key(owner);
        env.storage().persistent().set(&typed_key, &enabled);
    }
}
