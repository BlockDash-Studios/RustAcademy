//! Batch entry points for processing multiple escrows in a single transaction.
//!
//! # Design
//!
//! - **Non-atomic**: each item is processed independently. A failure in one item
//!   does not roll back the others. The caller receives a per-item result vector.
//! - **Safety limit**: [`MAX_BATCH_SIZE`] caps the number of items per call to
//!   prevent exceeding execution or storage limits.
//! - **Gas efficiency**: global pause and feature-pause checks are performed once
//!   before the loop; per-item state lookups happen only inside the loop.
//!
//! # Entry points (exposed via `lib.rs`)
//!
//! | Function          | Underlying single-item op |
//! |-------------------|---------------------------|
//! | `batch_withdraw`  | `escrow::withdraw`        |
//! | `batch_refund`    | `escrow::refund`          |

use soroban_sdk::{Env, Vec};

use crate::{
    admin,
    errors::QuickexError,
    escrow,
    storage::{is_feature_paused, PauseFlag},
    types::{BatchItemResult, BatchRefundParams, BatchWithdrawParams},
};

/// Maximum number of items allowed in a single batch call.
///
/// Chosen conservatively to stay well within Soroban's per-transaction
/// instruction and storage-entry limits while still providing meaningful
/// throughput gains for power users.
pub const MAX_BATCH_SIZE: u32 = 10;

// ---------------------------------------------------------------------------
// batch_withdraw
// ---------------------------------------------------------------------------

/// Process multiple withdrawals in a single transaction (non-atomic).
///
/// Performs the global and feature-level pause checks once, then iterates
/// over `items`, calling [`escrow::withdraw`] for each. Failures are captured
/// per-item; the rest of the batch continues regardless.
///
/// # Arguments
/// * `env`   – The contract environment.
/// * `items` – Up to [`MAX_BATCH_SIZE`] withdrawal parameter sets.
///
/// # Errors (whole-call, not per-item)
/// * [`QuickexError::ContractPaused`]  – contract is globally paused.
/// * [`QuickexError::OperationPaused`] – the Withdrawal feature is paused.
/// * [`QuickexError::BatchTooLarge`]   – `items.len() > MAX_BATCH_SIZE`.
///
/// # Returns
/// A `Vec<BatchItemResult>` with one entry per input item, in order.
pub fn batch_withdraw(
    env: &Env,
    items: Vec<BatchWithdrawParams>,
) -> Result<Vec<BatchItemResult>, QuickexError> {
    // --- whole-call guards (checked once, not per item) ---
    if admin::is_paused(env) {
        return Err(QuickexError::ContractPaused);
    }
    if is_feature_paused(env, PauseFlag::Withdrawal) {
        return Err(QuickexError::OperationPaused);
    }
    if items.len() > MAX_BATCH_SIZE {
        return Err(QuickexError::BatchTooLarge);
    }

    let mut results: Vec<BatchItemResult> = Vec::new(env);

    for i in 0..items.len() {
        let p = items.get(i).unwrap();
        let outcome = match escrow::withdraw(env, p.amount, p.to, p.salt) {
            Ok(_) => BatchItemResult::Ok,
            Err(e) => BatchItemResult::Err(e as u32),
        };
        results.push_back(outcome);
    }

    Ok(results)
}

// ---------------------------------------------------------------------------
// batch_refund
// ---------------------------------------------------------------------------

/// Process multiple refunds in a single transaction (non-atomic).
///
/// Performs the global and feature-level pause checks once, then iterates
/// over `items`, calling [`escrow::refund`] for each. Failures are captured
/// per-item; the rest of the batch continues regardless.
///
/// # Arguments
/// * `env`   – The contract environment.
/// * `items` – Up to [`MAX_BATCH_SIZE`] refund parameter sets.
///
/// # Errors (whole-call, not per-item)
/// * [`QuickexError::ContractPaused`]  – contract is globally paused.
/// * [`QuickexError::OperationPaused`] – the Refund feature is paused.
/// * [`QuickexError::BatchTooLarge`]   – `items.len() > MAX_BATCH_SIZE`.
///
/// # Returns
/// A `Vec<BatchItemResult>` with one entry per input item, in order.
pub fn batch_refund(
    env: &Env,
    items: Vec<BatchRefundParams>,
) -> Result<Vec<BatchItemResult>, QuickexError> {
    // --- whole-call guards (checked once, not per item) ---
    if admin::is_paused(env) {
        return Err(QuickexError::ContractPaused);
    }
    if is_feature_paused(env, PauseFlag::Refund) {
        return Err(QuickexError::OperationPaused);
    }
    if items.len() > MAX_BATCH_SIZE {
        return Err(QuickexError::BatchTooLarge);
    }

    let mut results: Vec<BatchItemResult> = Vec::new(env);

    for i in 0..items.len() {
        let p = items.get(i).unwrap();
        let outcome = match escrow::refund(env, p.commitment, p.caller) {
            Ok(()) => BatchItemResult::Ok,
            Err(e) => BatchItemResult::Err(e as u32),
        };
        results.push_back(outcome);
    }

    Ok(results)
}
