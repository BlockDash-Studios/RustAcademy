//! Signature replay protection via a per-signer nonce registry.
//!
//! ## Domain separation
//!
//! Every signed payload must include:
//! - The contract's own address (`env.current_contract_address()`).
//! - The network passphrase hash (`env.ledger().network_id()`).
//! - A unique nonce (`BytesN<32>`).
//! - An expiry ledger timestamp (`expires_at`).
//!
//! The canonical signed message is:
//! ```text
//! SHA-256(contract_id || network_id || signer_xdr || nonce || BE(expires_at))
//! ```
//!
//! ## Replay protection guarantees
//!
//! 1. **Nonce uniqueness** – once consumed, the (signer, nonce) pair is stored
//!    permanently; any re-use returns [`QuickexError::NonceAlreadyUsed`].
//! 2. **Expiry enforcement** – if `expires_at > 0` and the current ledger
//!    timestamp is ≥ `expires_at`, the call returns [`QuickexError::SignatureExpired`].
//! 3. **Domain binding** – the message digest binds the contract address and
//!    network passphrase, so a signature valid on testnet cannot be replayed on
//!    mainnet, and a signature for contract A cannot be used against contract B.

use soroban_sdk::{xdr::ToXdr, Address, Bytes, BytesN, Env};

use crate::{
    errors::QuickexError,
    storage::{consume_nonce, nonce_used},
};

/// Build the canonical domain-separated message digest for a signed payload.
///
/// `SHA-256(contract_id || network_id || signer_xdr || nonce || BE(expires_at))`
pub fn build_message_hash(
    env: &Env,
    signer: &Address,
    nonce: &BytesN<32>,
    expires_at: u64,
) -> BytesN<32> {
    let mut msg = Bytes::new(env);
    // Domain: contract address
    msg.append(&env.current_contract_address().to_xdr(env));
    // Domain: network passphrase hash (BytesN<32> → Bytes)
    msg.append(&Bytes::from(env.ledger().network_id()));
    // Signer identity
    msg.append(&signer.to_xdr(env));
    // Nonce
    msg.append(&Bytes::from(nonce.clone()));
    // Expiry (big-endian u64)
    msg.append(&Bytes::from_array(env, &expires_at.to_be_bytes()));
    env.crypto().sha256(&msg).into()
}

/// Verify replay protection for a signed operation and, if valid, consume the nonce.
///
/// Checks (in order):
/// 1. Expiry: if `expires_at > 0` and `now >= expires_at` → [`SignatureExpired`].
/// 2. Nonce uniqueness: if already consumed → [`NonceAlreadyUsed`].
/// 3. Marks the nonce as consumed.
///
/// The caller is responsible for verifying the cryptographic signature itself
/// (via `env.crypto().ed25519_verify` or `require_auth`). This function only
/// enforces the replay-protection invariants.
///
/// # Arguments
/// - `signer`     – address whose nonce registry is checked.
/// - `nonce`      – 32-byte unique value chosen by the signer.
/// - `expires_at` – ledger timestamp after which the payload is invalid; `0` = no expiry.
pub fn verify_and_consume_nonce(
    env: &Env,
    signer: &Address,
    nonce: &BytesN<32>,
    expires_at: u64,
) -> Result<(), QuickexError> {
    // 1. Expiry check
    if expires_at > 0 && env.ledger().timestamp() >= expires_at {
        return Err(QuickexError::SignatureExpired);
    }

    // 2. Replay check
    if nonce_used(env, signer, nonce) {
        return Err(QuickexError::NonceAlreadyUsed);
    }

    // 3. Consume
    consume_nonce(env, signer, nonce);
    Ok(())
}
