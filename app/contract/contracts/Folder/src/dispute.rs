//! Dispute timeout, auto-resolution, and stale dispute cleanup.
//!
//! Issue #49: disputes must not remain open forever. This module adds a
//! configurable resolution timeout and a deterministic automatic resolution
//! path that transitions expired disputes to a terminal state.
//!
//! # Timeout semantics
//!
//! When a dispute is opened, the current global timeout and default expiry
//! action are snapshotted into per-escrow metadata. Anyone can later call
//! [`resolve_expired_dispute`] once the timeout has elapsed to move the escrow
//! to a terminal state and release the locked funds.
//!
//! # Expiry actions
//!
//! - [`DisputeExpiryAction::RefundOwner`] – return funds to the original owner.
//! - [`DisputeExpiryAction::PayArbiter`] – pay funds to the assigned arbiter.
//!
//! The default action is [`RefundOwner`] because it is the safest deterministic
//! fallback and avoids leaving funds locked in the contract.

use soroban_sdk::{token, Address, Bytes, BytesN, Env};

use crate::{
    admin,
    errors::RustAcademyError,
    events, hook,
    storage::{
        self, clear_dispute_state, get_dispute_expiry, get_dispute_expiry_action,
        get_dispute_timeout, get_escrow, put_dispute_expiry, put_escrow,
    },
    types::{
        DisputeExpiry, DisputeExpiryAction, EscrowEntry, EscrowStatus, HookEventKind, Role,
    },
};

/// Set the global dispute resolution timeout in seconds.
///
/// Requires the caller to have the Admin or Operator role. Emits a
/// `DisputeTimeoutConfigSet` event.
///
/// # Errors
/// - [`InvalidTimeout`] – `timeout_secs` is zero.
/// - [`InsufficientRole`] – caller lacks the required role.
pub fn set_timeout(
    env: &Env,
    caller: Address,
    timeout_secs: u64,
) -> Result<(), RustAcademyError> {
    if timeout_secs == 0 {
        return Err(RustAcademyError::InvalidTimeout);
    }
    admin::require_any_role(env, &caller, &[Role::Admin, Role::Operator])?;

    storage::set_dispute_timeout(env, timeout_secs);
    events::publish_dispute_timeout_config_set(env, timeout_secs);
    Ok(())
}

/// Set the global default action taken when a dispute expires.
///
/// Requires the caller to have the Admin or Operator role. Emits a
/// `DisputeExpiryActionSet` event.
///
/// # Errors
/// - [`InsufficientRole`] – caller lacks the required role.
pub fn set_expiry_action(
    env: &Env,
    caller: Address,
    action: DisputeExpiryAction,
) -> Result<(), RustAcademyError> {
    admin::require_any_role(env, &caller, &[Role::Admin, Role::Operator])?;

    storage::set_dispute_expiry_action(env, action);
    events::publish_dispute_expiry_action_set(env, action);
    Ok(())
}

/// Record per-escrow dispute expiry metadata when a dispute is opened.
///
/// This snapshots the current global timeout and default expiry action so that
/// later changes to the global config do not affect already-open disputes.
/// Emits a `DisputeTimeoutSet` event.
pub fn record_dispute_expiry(env: &Env, commitment: BytesN<32>) {
    let timeout_secs = get_dispute_timeout(env);
    let now = env.ledger().timestamp();
    let expires_at = now.saturating_add(timeout_secs);
    let action = get_dispute_expiry_action(env);
    let expiry = DisputeExpiry { expires_at, action };

    let commitment_bytes: Bytes = commitment.clone().into();
    put_dispute_expiry(env, &commitment_bytes, &expiry);
    events::publish_dispute_timeout_set(env, commitment, action, expires_at);
}

/// Resolve a disputed escrow that has passed its resolution timeout.
///
/// Can be called by anyone once the timeout has elapsed. The outcome is
/// determined by the snapshotted [`DisputeExpiryAction`] and is fully
/// deterministic from on-chain state. Funds are released to the chosen
/// recipient, the dispute auxiliary state is cleaned up, and state-change
/// events are emitted.
///
/// Auto-resolution is intentionally not gated by pause flags because it is a
/// time-locked safety valve, but it still uses the reentrancy guard.
///
/// # Errors
/// - [`CommitmentNotFound`] – no escrow exists for the commitment.
/// - [`InvalidDisputeState`] – escrow is not in `Disputed` status.
/// - [`NoDisputeExpiry`] – no dispute expiry metadata exists.
/// - [`DisputeNotExpired`] – the timeout has not yet elapsed.
/// - [`InternalError`] – the configured action cannot be applied to this escrow.
pub fn resolve_expired_dispute(
    env: &Env,
    commitment: BytesN<32>,
) -> Result<(), RustAcademyError> {
    hook::assert_not_reentrant(env)?;

    let commitment_bytes: Bytes = commitment.clone().into();
    let entry: EscrowEntry =
        get_escrow(env, &commitment_bytes).ok_or(RustAcademyError::CommitmentNotFound)?;

    if entry.status != EscrowStatus::Disputed {
        return Err(RustAcademyError::InvalidDisputeState);
    }

    let expiry = get_dispute_expiry(env, &commitment_bytes).ok_or(RustAcademyError::NoDisputeExpiry)?;
    let now = env.ledger().timestamp();
    if now < expiry.expires_at {
        return Err(RustAcademyError::DisputeNotExpired);
    }

    let recipient = resolve_expiry_recipient(&entry, expiry.action)?;
    let (final_status, hook_kind) = match expiry.action {
        DisputeExpiryAction::RefundOwner => (EscrowStatus::Refunded, HookEventKind::Refund),
        DisputeExpiryAction::PayArbiter => (EscrowStatus::Spent, HookEventKind::Settle),
    };

    let mut updated = entry.clone();
    updated.status = final_status;
    put_escrow(env, &commitment_bytes, &updated);

    let token_client = token::Client::new(env, &entry.token);
    token_client.transfer(
        &env.current_contract_address(),
        &recipient,
        &entry.amount_paid,
    );

    // Clean up dispute votes and expiry metadata so stale disputes cannot
    // accumulate storage rent.
    clear_dispute_state(env, &commitment_bytes, &entry.arbiters);

    events::publish_dispute_auto_resolved(
        env,
        commitment.clone(),
        expiry.action,
        recipient.clone(),
        entry.amount_paid,
    );

    if final_status == EscrowStatus::Refunded {
        events::publish_escrow_refunded(
            env,
            entry.owner.clone(),
            commitment.clone(),
            entry.token.clone(),
            entry.amount_paid,
        );
    }

    hook::invoke_hooks(
        env,
        hook_kind,
        &commitment,
        entry.owner,
        entry.token,
        entry.amount_paid,
        0,
    );

    Ok(())
}

/// Determine the recipient for an auto-resolved dispute based on the expiry action.
///
/// For [`DisputeExpiryAction::RefundOwner`] the owner is always used. For
/// [`DisputeExpiryAction::PayArbiter`] the assigned single arbiter is preferred;
/// if the escrow is in multi-sig mode, the first listed arbiter is used as a
/// deterministic fallback.
fn resolve_expiry_recipient(
    entry: &EscrowEntry,
    action: DisputeExpiryAction,
) -> Result<Address, RustAcademyError> {
    match action {
        DisputeExpiryAction::RefundOwner => Ok(entry.owner.clone()),
        DisputeExpiryAction::PayArbiter => {
            if let Some(arbiter) = entry.arbiter.clone() {
                Ok(arbiter)
            } else if let Some(arbiter) = entry.arbiters.first() {
                Ok(arbiter.clone())
            } else {
                // A dispute should never be opened without an arbiter, but
                // default to the owner to avoid locking funds.
                Ok(entry.owner.clone())
            }
        }
    }
}

