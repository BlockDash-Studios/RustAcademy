use crate::errors::QuickexError;
use crate::events::publish_privacy_toggled;
use soroban_sdk::{xdr::ToXdr, Address, BytesN, Env};

/// Get the storage key for an account's privacy flag.
///
/// Uses SHA256 for optimal balance of security and gas efficiency.
fn get_privacy_key(env: &Env, owner: &Address) -> BytesN<32> {
    env.crypto().sha256(&owner.to_xdr(env)).into()
}

/// Enable or disable privacy for an account.
///
/// Reads the current state first and returns [`QuickexError::PrivacyAlreadySet`]
/// if the requested value matches the current value. Otherwise persists the new
/// state and publishes a [`crate::events::publish_privacy_toggled`] event.
pub fn set_privacy(env: &Env, owner: Address, enabled: bool) -> Result<(), QuickexError> {
    owner.require_auth();

    let storage_key = get_privacy_key(env, &owner);
    let current: bool = env
        .storage()
        .persistent()
        .get(&storage_key)
        .unwrap_or(false);
    if current == enabled {
        return Err(QuickexError::PrivacyAlreadySet);
    }

    env.storage().persistent().set(&storage_key, &enabled);

    publish_privacy_toggled(env, owner, enabled);
    Ok(())
}

/// Return the current boolean privacy state for an account.
///
/// Defaults to `false` if never set.
pub fn get_privacy(env: &Env, owner: Address) -> bool {
    let storage_key = get_privacy_key(env, &owner);
    env.storage()
        .persistent()
        .get(&storage_key)
        .unwrap_or(false)
}
