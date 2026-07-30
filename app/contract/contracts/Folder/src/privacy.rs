//! # Privacy Module
//!
//! This module provides two independent privacy APIs:
//!
//! 1. **Legacy boolean** (`set_privacy` / `get_privacy`) — the original on/off
//!    flag. Backward-compatible helpers live in [`crate::legacy_privacy`] and
//!    are re-exported here for convenience.
//!
//! 2. **PrivacyLevel** (numeric) — a per-account `u32` level with append-only
//!    history. Used by the `enable_privacy` contract entry point.
//!
//! ## Migration
//!
//! [`migrate_boolean_to_level`] converts a legacy boolean flag into the
//! equivalent numeric level (off → `0`, on → `1`) so that both storage paths
//! can coexist during a rolling upgrade.
//!
//! ## Storage keys
//!
//! | API            | Key variant                         | Value type |
//! |----------------|-------------------------------------|------------|
//! | Boolean        | `DataKey::PrivacyEnabled(Address)`  | `bool`     |
//! | Level          | `DataKey::PrivacyLevel(Address)`    | `u32`      |
//! | Level history  | `DataKey::PrivacyHistory(Address)`  | `Vec<u32>` |

use crate::storage::{DataKey, RecordType, set_or_extend_ttl, MAX_PRIVACY_HISTORY};
use soroban_sdk::{Address, Env, Vec};

// Re-export legacy boolean helpers so that existing callers
// (`privacy::set_privacy`, `privacy::get_privacy`) continue to work.
pub use crate::legacy_privacy::{get_privacy, set_privacy};

// ---------------------------------------------------------------------------
// PrivacyLevel helpers (numeric API)
// ---------------------------------------------------------------------------

/// Set privacy level for an account.
pub fn set_privacy_level(env: &Env, account: &Address, level: u32) {
    let key = DataKey::PrivacyLevel(account.clone());
    env.storage().persistent().set(&key, &level);
    set_or_extend_ttl(env, &key, RecordType::Privacy);
}

/// Get privacy level for an account.
///
/// Returns `None` if no level has been set.
pub fn get_privacy_level(env: &Env, account: &Address) -> Option<u32> {
    let key = DataKey::PrivacyLevel(account.clone());
    let result = env.storage().persistent().get(&key);
    if result.is_some() {
        set_or_extend_ttl(env, &key, RecordType::Privacy);
    }
    result
}

/// Append a level entry to the per-account privacy history.
///
/// The new entry is pushed to the front (newest-first). History is capped at
/// [`MAX_PRIVACY_HISTORY`] entries; the oldest entries are evicted when the cap
/// is exceeded so per-account storage stays bounded (Issue #51).
pub fn add_privacy_history(env: &Env, account: &Address, level: u32) {
    let key = DataKey::PrivacyHistory(account.clone());
    let mut history: Vec<u32> = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or(Vec::new(env));
    history.push_front(level);
    while history.len() > MAX_PRIVACY_HISTORY {
        history.pop_back();
    }
    env.storage().persistent().set(&key, &history);
    set_or_extend_ttl(env, &key, RecordType::Privacy);
}

/// Get the privacy history for an account.
///
/// Returns an empty vec if never set. Order is newest-first.
pub fn get_privacy_history(env: &Env, account: &Address) -> Vec<u32> {
    let key = DataKey::PrivacyHistory(account.clone());
    let result = env.storage().persistent().get(&key);
    if result.is_some() {
        set_or_extend_ttl(env, &key, RecordType::Privacy);
    }
    result.unwrap_or(Vec::new(env))
}

// ---------------------------------------------------------------------------
// Migration: boolean → PrivacyLevel
// ---------------------------------------------------------------------------

/// Migrate a legacy boolean privacy flag to the numeric [`PrivacyLevel`] API.
///
/// - `false` → level `0` (off)
/// - `true`  → level `1` (basic privacy)
///
/// If no boolean flag exists for `account`, this is a no-op.
/// Cleans up both the typed and legacy boolean keys after migration.
/// Returns the resulting privacy level.
pub fn migrate_boolean_to_level(env: &Env, account: &Address) -> u32 {
    use crate::legacy_privacy::{read_privacy_flag, cleanup_legacy_key, typed_privacy_key};

    let enabled = read_privacy_flag(env, account);
    let level: u32 = if enabled { 1 } else { 0 };

    set_privacy_level(env, account, level);
    add_privacy_history(env, account, level);

    // Clean up both boolean storage keys so only the level remains.
    cleanup_legacy_key(env, account);
    let typed_key = typed_privacy_key(account);
    env.storage().persistent().remove(&typed_key);

    level
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    #[test]
    fn test_set_and_get_privacy_level() {
        let env = Env::default();
        let contract_id = env.register(crate::RustAcademyContract, ());
        let account = Address::generate(&env);
        env.mock_all_auths();
        env.as_contract(&contract_id, || {
            set_privacy_level(&env, &account, 5);
            assert_eq!(get_privacy_level(&env, &account), Some(5));
        });
    }

    #[test]
    fn test_get_privacy_level_returns_none_when_unset() {
        let env = Env::default();
        let contract_id = env.register(crate::RustAcademyContract, ());
        let account = Address::generate(&env);
        env.as_contract(&contract_id, || {
            assert!(get_privacy_level(&env, &account).is_none());
        });
    }

    #[test]
    fn test_add_privacy_history_newest_first() {
        let env = Env::default();
        let contract_id = env.register(crate::RustAcademyContract, ());
        let account = Address::generate(&env);
        env.as_contract(&contract_id, || {
            add_privacy_history(&env, &account, 1);
            add_privacy_history(&env, &account, 2);
            add_privacy_history(&env, &account, 3);
            let history = get_privacy_history(&env, &account);
            assert_eq!(history.len(), 3);
            assert_eq!(history.get(0).unwrap(), 3u32);
            assert_eq!(history.get(1).unwrap(), 2u32);
            assert_eq!(history.get(2).unwrap(), 1u32);
        });
    }

    #[test]
    fn test_history_is_bounded() {
        let env = Env::default();
        let contract_id = env.register(crate::RustAcademyContract, ());
        let account = Address::generate(&env);
        env.as_contract(&contract_id, || {
            let total = MAX_PRIVACY_HISTORY + 10;
            for i in 0..total {
                add_privacy_history(&env, &account, i);
            }
            let history = get_privacy_history(&env, &account);
            assert_eq!(history.len(), MAX_PRIVACY_HISTORY);
        });
    }

    #[test]
    fn test_migrate_boolean_true_to_level_1() {
        let env = Env::default();
        let contract_id = env.register(crate::RustAcademyContract, ());
        let account = Address::generate(&env);
        env.mock_all_auths();
        env.as_contract(&contract_id, || {
            crate::legacy_privacy::tests::set_raw_privacy(&env, &account, true);
            let level = migrate_boolean_to_level(&env, &account);
            assert_eq!(level, 1);
            assert_eq!(get_privacy_level(&env, &account), Some(1));
            assert!(!crate::legacy_privacy::read_privacy_flag(&env, &account));
        });
    }

    #[test]
    fn test_migrate_boolean_false_to_level_0() {
        let env = Env::default();
        let contract_id = env.register(crate::RustAcademyContract, ());
        let account = Address::generate(&env);
        env.mock_all_auths();
        env.as_contract(&contract_id, || {
            crate::legacy_privacy::tests::set_raw_privacy(&env, &account, false);
            let level = migrate_boolean_to_level(&env, &account);
            assert_eq!(level, 0);
            assert_eq!(get_privacy_level(&env, &account), Some(0));
        });
    }

    #[test]
    fn test_migrate_boolean_noop_when_no_flag() {
        let env = Env::default();
        let contract_id = env.register(crate::RustAcademyContract, ());
        let account = Address::generate(&env);
        env.mock_all_auths();
        env.as_contract(&contract_id, || {
            let level = migrate_boolean_to_level(&env, &account);
            assert_eq!(level, 0);
            assert_eq!(get_privacy_level(&env, &account), Some(0));
        });
    }
}
