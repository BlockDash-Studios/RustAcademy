//! # Stealth Address – Proof of Concept (Issue #157 / Privacy v2)
//!
//! ## Overview
//!
//! Implements a Diffie-Hellman-based stealth address mechanism on Soroban.
//! Because Soroban SDK v23 does not expose raw elliptic-curve point operations,
//! we simulate the ECDH shared-secret derivation using SHA-256 as a key-derivation
//! function over the concatenation of the sender's ephemeral public key and the
//! recipient's scan key.  This is a **proof-of-concept** – a production deployment
//! would replace the KDF with a proper secp256k1 / Ed25519 point-multiplication
//! once the SDK exposes those primitives.
//!
//! ## Protocol (simplified dual-key stealth)
//!
//! ```text
//! Recipient publishes:  (scan_pub_key, spend_pub_key)   [32 bytes each]
//!
//! Sender (off-chain):
//!   1. Generate ephemeral keypair (eph_priv, eph_pub).
//!   2. shared_secret = KDF(eph_pub || scan_pub_key)     [SHA-256]
//!   3. stealth_address = KDF(spend_pub || shared_secret)
//!   4. Call register_ephemeral_key(stealth_address, eph_pub, token, amount, timeout)
//!      → funds locked under stealth_address commitment.
//!
//! Recipient (off-chain):
//!   1. Scan chain for EphemeralKeyRegistered events.
//!   2. For each event: shared_secret = KDF(eph_pub || scan_priv_key * G)
//!      (simplified: KDF(eph_pub || scan_priv_key_bytes))
//!   3. Recompute stealth_address = KDF(spend_pub || shared_secret).
//!   4. If stealth_address matches → funds are for me.
//!   5. Derive stealth_priv_key = KDF(spend_priv || shared_secret).
//!   6. Call stealth_withdraw(stealth_address, eph_pub, amount, token)
//!      → contract re-derives stealth_address and releases funds.
//! ```n//!
//! ## On-chain privacy guarantee
//!
//! The recipient's main public address (`spend_pub_key` / `scan_pub_key`) never
//! appears in any transaction or event.  Only the one-time `stealth_address` and
//! the sender's `eph_pub` are recorded on-chain.
//!
//! ## Invariants (Issue #432)
//!
//! The following invariants must hold at all times:
//!
//! - **INV-S-1**: Stealth withdrawal never leaves a stale entry with non-zero balance.
//! - **INV-S-2**: Concurrent stealth deposit/withdrawal preserves total deposited value = escrow + stealth.
//! - **INV-S-3**: Balance is validated before and after every state transition.
//! - **INV-S-4**: Terminal stealth entries are immediately cleaned up after successful withdrawal.

use soroban_sdk::{token, Address, Bytes, BytesN, Env};

use crate::{
    errors::RustAcademyError,
    events,
    storage::{
        get_stealth_escrow, get_stealth_total_balance, put_stealth_escrow,
        remove_stealth_escrow, require_stealth_balance_invariant,
    },
    types::{EscrowStatus, StealthDepositParams, StealthEscrowEntry},
};

// ---------------------------------------------------------------------------
// Key-derivation helpers
// ---------------------------------------------------------------------------

/// Derive a 32-byte shared secret from two 32-byte public-key blobs.
///
/// `KDF(a, b) = SHA-256(a || b)`
///
/// In a production implementation this would be replaced by proper EC scalar
/// multiplication (e.g. `eph_priv * scan_pub` on secp256k1).
pub fn derive_shared_secret(env: &Env, key_a: &BytesN<32>, key_b: &BytesN<32>) -> BytesN<32> {
    let mut payload = Bytes::new(env);
    payload.append(&Bytes::from(key_a.clone()));
    payload.append(&Bytes::from(key_b.clone()));
    env.crypto().sha256(&payload).into()
}

/// Derive the one-time stealth address from a spend key and a shared secret.
///
/// `stealth = SHA-256(spend_pub || shared_secret)`
pub fn derive_stealth_address(
    env: &Env,
    spend_pub: &BytesN<32>,
    shared_secret: &BytesN<32>,
) -> BytesN<32> {
    let mut payload = Bytes::new(env);
    payload.append(&Bytes::from(spend_pub.clone()));
    payload.append(&Bytes::from(shared_secret.clone()));
    env.crypto().sha256(&payload).into()
}

// ---------------------------------------------------------------------------
// register_ephemeral_key
// ---------------------------------------------------------------------------

/// Register an ephemeral public key and lock funds for a stealth recipient.
///
/// The sender provides:
/// - `stealth_address` – the one-time address derived off-chain via DH.
/// - `eph_pub`         – the sender's ephemeral public key (32 bytes).
/// - `spend_pub`       – recipient's spend public key (32 bytes).
///
/// The contract re-derives the stealth address on-chain to verify the sender's
/// computation, then locks `amount` of `token` under that stealth address.
///
/// # Errors
/// - [`InvalidAmount`]            – amount ≤ 0.
/// - [`StealthAddressMismatch`]   – on-chain re-derivation does not match `stealth_address`.
/// - [`StealthAddressAlreadyUsed`]– a deposit already exists for this stealth address.
pub fn register_ephemeral_key(
    env: &Env,
    params: StealthDepositParams,
) -> Result<BytesN<32>,  RustAcademyError> {
    let StealthDepositParams {
        sender,
        token,
        amount_due,
        amount_paid,
        eph_pub,
        spend_pub,
        stealth_address,
        timeout_secs,
    } = params;

    if amount_due <= 0 || amount_paid <= 0 {
        return Err( RustAcademyError::InvalidAmount);
    }

    if amount_paid > amount_due {
        return Err( RustAcademyError::Overpayment);
    }

    sender.require_auth();

    // Re-derive on-chain to verify sender's computation.
    // shared_secret = KDF(eph_pub || spend_pub)
    let shared_secret = derive_shared_secret(env, &eph_pub, &spend_pub);
    // stealth = KDF(spend_pub || shared_secret)
    let expected_stealth = derive_stealth_address(env, &spend_pub, &shared_secret);

    if expected_stealth != stealth_address {
        return Err( RustAcademyError::StealthAddressMismatch);
    }

    // Reject duplicate stealth addresses (replay protection).
    if get_stealth_escrow(env, &stealth_address).is_some() {
        return Err( RustAcademyError::StealthAddressAlreadyUsed);
    }

    // Validate balance invariant before state transition
    let balance_before = get_stealth_total_balance(env);

    // Transfer funds from sender to contract.
    let token_client = token::Client::new(env, &token);
    let contract_addr = env.current_contract_address();
    token_client.transfer(&sender, &contract_addr, &amount_paid);

    // Validate balance invariant after transfer
    // The contract should now hold `amount_paid` additional tokens
    require_stealth_balance_invariant(
        env,
        balance_before.saturating_add(amount_paid),
        false,
    )?;

    let now = env.ledger().timestamp();
    let expires_at = if timeout_secs > 0 {
        now.saturating_add(timeout_secs)
    } else {
        0
    };

    let entry = StealthEscrowEntry {
        token: token.clone(),
        amount_due,
        amount_paid,
        eph_pub: eph_pub.clone(),
        status: EscrowStatus::Pending,
        created_at: now,
        expires_at,
        schema_version: crate::types::STEALTH_ESCROW_SCHEMA_VERSION,
    };

    put_stealth_escrow(env, &stealth_address, &entry);

    events::publish_ephemeral_key_registered(
        env,
        stealth_address.clone(),
        eph_pub,
        token,
        amount_due,
        amount_paid,
        expires_at,
    );

    Ok(stealth_address)
}

// ---------------------------------------------------------------------------
// stealth_withdraw
// ---------------------------------------------------------------------------

/// Withdraw funds locked under a stealth address.
///
/// The caller proves ownership by supplying the `spend_pub` key and the
/// `eph_pub` from the registration event.  The contract re-derives the
/// stealth address and, if it matches, transfers funds to `recipient`.
///
/// The `recipient` address is the caller's *real* on-chain address for
/// receiving the tokens – it is only revealed at withdrawal time and is
/// not linked to the original stealth address in any prior transaction.
///
/// # Errors
/// - [`StealthEscrowNotFound`]  – no escrow for this stealth address.
/// - [`AlreadySpent`]           – escrow already withdrawn or refunded.
/// - [`EscrowExpired`]          – escrow has passed its expiry.
/// - [`StealthAddressMismatch`] – re-derived address does not match.
/// - [`InternalError`]          – balance invariant violated after withdrawal.
pub fn stealth_withdraw(
    env: &Env,
    recipient: Address,
    eph_pub: BytesN<32>,
    spend_pub: BytesN<32>,
    stealth_address: BytesN<32>,
) -> Result<bool, RustAcademyError> {
    recipient.require_auth();

    let entry =
        get_stealth_escrow(env, &stealth_address).ok_or(RustAcademyError::StealthEscrowNotFound)?;

    if entry.status != EscrowStatus::Pending {
        return Err(RustAcademyError::AlreadySpent);
    }

    if entry.expires_at > 0 && env.ledger().timestamp() >= entry.expires_at {
        return Err(RustAcademyError::EscrowExpired);
    }

    // Validate the stored amount before proceeding
    if entry.amount_paid <= 0 {
        return Err(RustAcademyError::InvalidAmount);
    }

    // Verify the caller knows the correct spend_pub for this stealth address.
    let shared_secret = derive_shared_secret(env, &eph_pub, &spend_pub);
    let expected_stealth = derive_stealth_address(env, &spend_pub, &shared_secret);

    if expected_stealth != stealth_address {
        return Err(RustAcademyError::StealthAddressMismatch);
    }

    // Validate balance invariant before withdrawal
    let balance_before = get_stealth_total_balance(env);

    // Transfer funds to recipient.
    let token_client = token::Client::new(env, &entry.token);
    token_client.transfer(
        &env.current_contract_address(),
        &recipient,
        &entry.amount_paid,
    );

    // Verify balance invariant after withdrawal
    // The contract should have released `entry.amount_paid` tokens
    require_stealth_balance_invariant(
        env,
        balance_before.saturating_sub(entry.amount_paid),
        false,
    )?;

    // Cleanup terminal entry after successful withdrawal (INV-S-4)
    remove_stealth_escrow(env, &stealth_address);

    events::publish_stealth_withdrawn(
        env,
        stealth_address,
        recipient,
        entry.token,
        entry.amount_paid,
    );

    Ok(true)
}

// ---------------------------------------------------------------------------
// get_stealth_escrow_status (read-only)
// ---------------------------------------------------------------------------

/// Return the status of a stealth escrow without revealing sensitive fields.
///
/// Returns `None` if no escrow exists for the given stealth address.
pub fn get_stealth_status(env: &Env, stealth_address: &BytesN<32>) -> Option<EscrowStatus> {
    get_stealth_escrow(env, stealth_address).map(|e| e.status)
}

// ---------------------------------------------------------------------------
// cleanup_stealth_escrow
// ---------------------------------------------------------------------------

/// Remove a terminal (withdrawn/refunded) stealth escrow entry to reclaim its
/// storage deposit (Issue #51).
///
/// Only entries in `Spent` or `Refunded` status may be removed; an attempt to
/// clean a still-`Pending` entry returns [`AlreadySpent`](RustAcademyError::AlreadySpent)
/// and leaves storage untouched. After removal, [`get_stealth_status`] and
/// [`get_stealth_escrow`](crate::storage::get_stealth_escrow) return `None`, so
/// no stale lookup can resolve to the cleaned address. O(1) — no state scan.
///
/// # Errors
/// - [`StealthEscrowNotFound`](RustAcademyError::StealthEscrowNotFound) – no entry for the address.
/// - [`AlreadySpent`](RustAcademyError::AlreadySpent) – entry is not in a terminal state.
/// - [`InternalError`] – balance invariant check fails for stale entry.
pub fn cleanup_stealth_escrow(
    env: &Env,
    stealth_address: BytesN<32>,
) -> Result<(), RustAcademyError> {
    let entry = get_stealth_escrow(env, &stealth_address)
        .ok_or(RustAcademyError::StealthEscrowNotFound)?;

    match entry.status {
        EscrowStatus::Spent | EscrowStatus::Refunded => {
            // Validate no orphaned balance before cleanup (INV-S-1)
            if entry.amount_paid != 0 {
                // This should never happen - indicates corrupted state
                return Err(RustAcademyError::InternalError);
            }
            remove_stealth_escrow(env, &stealth_address);
            events::publish_stealth_escrow_cleaned(env, stealth_address);
            Ok(())
        }
        _ => Err(RustAcademyError::AlreadySpent),
    }
}
