//! Escrow core logic: deposit, withdraw, and refund.
//!
//! # State Machine
//!
//! ```text
//! [*] --> Pending  : deposit() / deposit_with_commitment()
//! Pending --> Spent    : withdraw(proof)  [current_time < expires_at OR no expiry]
//! Pending --> Refunded : refund(owner)    [current_time >= expires_at]
//! Pending --> Disputed : dispute()        [any participant can call]
//! Disputed --> Spent   : resolve_dispute() [arbiter decides for recipient]
//! Disputed --> Refunded: resolve_dispute() [arbiter decides for owner]
//! ```
//!
//! # Time-lock Invariants
//!
//! These invariants are strictly enforced and must hold at all times:
//!
//! **INV-1 (No early withdrawal):**
//!   If `expires_at > 0` and `env.ledger().timestamp() >= expires_at`,
//!   `withdraw` MUST fail with `EscrowExpired`. There is no override.
//!
//! **INV-2 (No early refund):**
//!   `refund` MUST fail with `EscrowNotExpired` unless BOTH:
//!   - `expires_at > 0` (escrow was created with a timeout), AND
//!   - `env.ledger().timestamp() >= expires_at` (timeout has been reached).
//!
//!  A non-expiring escrow (`expires_at == 0`) can NEVER be refunded via `refund`.
//!
//! **INV-3 (Overflow-safe expiry):**
//!   `expires_at` is always computed via `saturating_add` to prevent u64 overflow.
//!   An `expires_at` of `u64::MAX` is treated as effectively non-expiring for
//!   withdrawal but will never satisfy the `>= expires_at` refund condition in
//!   practice, as the ledger timestamp cannot reach `u64::MAX`.
//!
//! **INV-4 (Disputed funds are locked):**
//!   Neither `withdraw` nor `refund` may succeed while status is `Disputed`.
//!   Only `resolve_dispute` (arbiter-gated) can move funds out of `Disputed`.
//!
//! **INV-5 (Terminal states are final):**
//!   Once status is `Spent` or `Refunded`, no further state transitions are
//!   permitted. All entry points check this before any other logic.
//!
//! ## Asset Type Handling
//!
//! This module supports both Native XLM and Stellar Asset Contract (SAC) tokens:
//! - **Native XLM**: Uses the native lumens asset. The token address will be the stellar
//!   network's native asset identifier.
//! - **SAC Tokens**: Uses wrapped tokens via Stellar Asset Contracts (e.g., USDC, custom tokens).
//!
//! The contract uses the standardized `soroban_sdk::token::Client` which works uniformly across
//! both asset types. No special wrap/unwrap logic is needed as Soroban handles this transparently.
//!
//! Guard rails:
//! - `withdraw` fails with [`EscrowExpired`] if `expires_at > 0` and `now >= expires_at`.
//! - `withdraw` fails with [`AlreadySpent`] if status is not `Pending`.
//! - `withdraw` fails if escrow is `Disputed` (funds locked during dispute).
//! - `refund` fails with [`EscrowNotExpired`] if `expires_at == 0` or `now < expires_at`.
//! - Both fail with [`AlreadySpent`] if status is not `Pending`.
//! - `refund` fails with [`InvalidOwner`] if caller ≠ `entry.owner`.
//! - `dispute` requires an assigned arbiter and `Pending` status.
//! - `resolve_dispute` can only be called by the assigned arbiter.

use soroban_sdk::{token, Address, Bytes, BytesN, Env, Vec};

use crate::{
    admin, commitment, dispute,
    errors::RustAcademyError,
    escrow_id, events, fee_router, hook,
    storage::{
        clear_dispute_state, count_dispute_votes, get_commitment_escrow_id,
        get_dispute_vote, get_escrow, get_escrow_id_mapping, get_fee_config,
        get_oracle_fee_config, get_per_asset_fee, get_platform_wallet, has_dispute_vote,
        has_escrow, put_commitment_escrow_id, put_dispute_vote, put_escrow,
        put_escrow_id_mapping, remove_commitment_escrow_id,
        remove_dispute_votes_for_escrow, remove_escrow, remove_escrow_id_mapping, DataKey,
        LEDGER_THRESHOLD, SIX_MONTHS_IN_LEDGERS,
    },
    types::{
        DisputeVote, EscrowEntry, EscrowOperationEstimate, EscrowOperationLimits, EscrowStatus,
        HookEventKind, Role,
    },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Returns `true` when an escrow has expired according to the ledger clock.
///
/// Enforces INV-2: an escrow with `expires_at == 0` is considered non-expiring
/// and will NEVER return `true` here, making it ineligible for `refund`.
///
/// Enforces INV-1: once this returns `true`, `withdraw` is permanently blocked.
fn is_expired(env: &Env, entry: &EscrowEntry) -> bool {
    // expires_at == 0 means no timeout was set — never expired
    if entry.expires_at == 0 {
        return false;
    }
    env.ledger().timestamp() >= entry.expires_at
}

/// Returns `true` when an escrow is still within its valid withdrawal window.
///
/// Enforces INV-1: withdrawal is only valid if the escrow has NOT expired.
/// A non-expiring escrow (`expires_at == 0`) is always within its window.
fn is_within_window(env: &Env, entry: &EscrowEntry) -> bool {
    !is_expired(env, entry)
}

/// Validates and computes `expires_at` from `timeout_secs`.
///
/// Enforces INV-3: uses `saturating_add` to prevent u64 overflow. If the
/// result saturates to `u64::MAX`, we reject it explicitly — a timeout so
/// large it overflows is almost certainly a caller error, and allowing
/// `u64::MAX` as `expires_at` would create an escrow that can never be
/// refunded (timestamp can never reach `u64::MAX`) while also permanently
/// blocking withdrawal (INV-1 check: `now >= u64::MAX` is always false for
/// any real ledger). We surface this as `InvalidTimeout` instead of
/// silently creating a broken escrow.
fn compute_expires_at(env: &Env, timeout_secs: u64) -> Result<u64,  RustAcademyError> {
    if timeout_secs == 0 {
        return Ok(0); // non-expiring
    }
    let now = env.ledger().timestamp();
    let expires_at = now.saturating_add(timeout_secs);

    // Guard against saturated overflow: if the result is u64::MAX it means
    // timeout_secs was unreasonably large — reject it explicitly.
    if expires_at == u64::MAX {
        return Err( RustAcademyError::InvalidTimeout);
    }

    Ok(expires_at)
}

pub const MAX_OPERATION_SALT_BYTES: u32 = 512;
pub const MAX_SUPPORTED_TOKEN_COUNT: u32 = 1;
pub const MAX_DEPOSIT_FEE_RECIPIENTS: u32 = 0;
pub const MAX_WITHDRAW_ARBITERS: u32 = 0;
pub const MAX_WITHDRAW_FEE_RECIPIENTS: u32 = 3;

const DEPOSIT_BASE_CPU_INSTRUCTIONS: u64 = 465_139;
const DEPOSIT_BASE_MEMORY_BYTES: u64 = 72_430;
const WITHDRAW_BASE_CPU_INSTRUCTIONS: u64 = 452_582;
const WITHDRAW_BASE_MEMORY_BYTES: u64 = 68_096;
const ESTIMATED_CPU_PER_SALT_BYTE: u64 = 32;
const ESTIMATED_MEMORY_PER_SALT_BYTE: u64 = 8;
const ESTIMATED_CPU_PER_DEPOSIT_ARBITER: u64 = 20_000;
const ESTIMATED_MEMORY_PER_DEPOSIT_ARBITER: u64 = 4_096;
const ESTIMATED_CPU_PER_WITHDRAW_FEE_RECIPIENT: u64 = 15_000;
const ESTIMATED_MEMORY_PER_WITHDRAW_FEE_RECIPIENT: u64 = 4_096;
const SUPPORTED_DEPOSIT_MAX_CPU_INSTRUCTIONS: u64 = 700_000;
const SUPPORTED_DEPOSIT_MAX_MEMORY_BYTES: u64 = 120_000;
const SUPPORTED_WITHDRAW_MAX_CPU_INSTRUCTIONS: u64 = 620_000;
const SUPPORTED_WITHDRAW_MAX_MEMORY_BYTES: u64 = 96_000;

pub fn operation_limits() -> EscrowOperationLimits {
    EscrowOperationLimits {
        max_salt_bytes: MAX_OPERATION_SALT_BYTES,
        deposit_max_token_count: MAX_SUPPORTED_TOKEN_COUNT,
        deposit_max_arbiter_count: MAX_ARBITERS,
        deposit_max_fee_recips: MAX_DEPOSIT_FEE_RECIPIENTS,
        deposit_max_cpu_instructions: SUPPORTED_DEPOSIT_MAX_CPU_INSTRUCTIONS,
        deposit_max_memory_bytes: SUPPORTED_DEPOSIT_MAX_MEMORY_BYTES,
        withdraw_max_token_count: MAX_SUPPORTED_TOKEN_COUNT,
        withdraw_max_arbiter_count: MAX_WITHDRAW_ARBITERS,
        withdraw_max_fee_recips: MAX_WITHDRAW_FEE_RECIPIENTS,
        withdraw_max_cpu_instructions: SUPPORTED_WITHDRAW_MAX_CPU_INSTRUCTIONS,
        withdraw_max_memory_bytes: SUPPORTED_WITHDRAW_MAX_MEMORY_BYTES,
    }
}

pub fn estimate_deposit_resources_view(
    salt_bytes: u32,
    arbiter_count: u32,
) -> Result<EscrowOperationEstimate, RustAcademyError> {
    estimate_deposit_resources(salt_bytes, arbiter_count)
}

pub fn estimate_withdraw_resources_view(
    env: &Env,
    token: Address,
    salt_bytes: u32,
) -> Result<EscrowOperationEstimate, RustAcademyError> {
    estimate_withdraw_resources(salt_bytes, withdraw_fee_recipient_count(env, &token))
}

fn estimate_deposit_resources(
    salt_bytes: u32,
    arbiter_count: u32,
) -> Result<EscrowOperationEstimate, RustAcademyError> {
    if salt_bytes > MAX_OPERATION_SALT_BYTES {
        return Err(RustAcademyError::PayloadTooLarge);
    }
    if arbiter_count > MAX_ARBITERS {
        return Err(RustAcademyError::TooManyArbiters);
    }

    Ok(EscrowOperationEstimate {
        token_count: MAX_SUPPORTED_TOKEN_COUNT,
        arbiter_count,
        fee_recipient_count: MAX_DEPOSIT_FEE_RECIPIENTS,
        salt_bytes,
        estimated_cpu_instructions: DEPOSIT_BASE_CPU_INSTRUCTIONS
            .saturating_add((salt_bytes as u64).saturating_mul(ESTIMATED_CPU_PER_SALT_BYTE))
            .saturating_add(
                (arbiter_count as u64).saturating_mul(ESTIMATED_CPU_PER_DEPOSIT_ARBITER),
            ),
        estimated_memory_bytes: DEPOSIT_BASE_MEMORY_BYTES
            .saturating_add((salt_bytes as u64).saturating_mul(ESTIMATED_MEMORY_PER_SALT_BYTE))
            .saturating_add(
                (arbiter_count as u64).saturating_mul(ESTIMATED_MEMORY_PER_DEPOSIT_ARBITER),
            ),
    })
}

fn estimate_withdraw_resources(
    salt_bytes: u32,
    fee_recipient_count: u32,
) -> Result<EscrowOperationEstimate, RustAcademyError> {
    if salt_bytes > MAX_OPERATION_SALT_BYTES {
        return Err(RustAcademyError::PayloadTooLarge);
    }
    if fee_recipient_count > MAX_WITHDRAW_FEE_RECIPIENTS {
        return Err(RustAcademyError::TooManyFeeRecipients);
    }

    Ok(EscrowOperationEstimate {
        token_count: MAX_SUPPORTED_TOKEN_COUNT,
        arbiter_count: MAX_WITHDRAW_ARBITERS,
        fee_recipient_count,
        salt_bytes,
        estimated_cpu_instructions: WITHDRAW_BASE_CPU_INSTRUCTIONS
            .saturating_add((salt_bytes as u64).saturating_mul(ESTIMATED_CPU_PER_SALT_BYTE))
            .saturating_add(
                (fee_recipient_count as u64)
                    .saturating_mul(ESTIMATED_CPU_PER_WITHDRAW_FEE_RECIPIENT),
            ),
        estimated_memory_bytes: WITHDRAW_BASE_MEMORY_BYTES
            .saturating_add((salt_bytes as u64).saturating_mul(ESTIMATED_MEMORY_PER_SALT_BYTE))
            .saturating_add(
                (fee_recipient_count as u64)
                    .saturating_mul(ESTIMATED_MEMORY_PER_WITHDRAW_FEE_RECIPIENT),
            ),
    })
}

fn validate_deposit_resources(salt: &Bytes, arbiter_count: u32) -> Result<(), RustAcademyError> {
    let estimate = estimate_deposit_resources(salt.len(), arbiter_count)?;
    if estimate.token_count > MAX_SUPPORTED_TOKEN_COUNT {
        return Err(RustAcademyError::TooManyTokens);
    }
    if estimate.estimated_cpu_instructions > SUPPORTED_DEPOSIT_MAX_CPU_INSTRUCTIONS
        || estimate.estimated_memory_bytes > SUPPORTED_DEPOSIT_MAX_MEMORY_BYTES
    {
        return Err(RustAcademyError::PayloadTooLarge);
    }
    Ok(())
}

fn withdraw_fee_recipient_count(env: &Env, token: &Address) -> u32 {
    let mut recipient_count = 1u32;
    let per_asset = get_per_asset_fee(env, token);
    let has_fees = per_asset
        .map(|config| config.fee_bps > 0)
        .unwrap_or_else(|| {
            get_fee_config(env).fee_bps > 0 || get_oracle_fee_config(env).is_some()
        });

    if !has_fees {
        return recipient_count;
    }

    if get_platform_wallet(env).is_some() {
        recipient_count = recipient_count.saturating_add(1);
    }
    if fee_router::active_collector(env).is_some() {
        recipient_count = recipient_count.saturating_add(1);
    }

    recipient_count
}

fn validate_withdraw_resources(
    env: &Env,
    token: &Address,
    salt: &Bytes,
) -> Result<(), RustAcademyError> {
    let estimate = estimate_withdraw_resources(salt.len(), withdraw_fee_recipient_count(env, token))?;
    if estimate.token_count > MAX_SUPPORTED_TOKEN_COUNT {
        return Err(RustAcademyError::TooManyTokens);
    }
    if estimate.estimated_cpu_instructions > SUPPORTED_WITHDRAW_MAX_CPU_INSTRUCTIONS
        || estimate.estimated_memory_bytes > SUPPORTED_WITHDRAW_MAX_MEMORY_BYTES
    {
        return Err(RustAcademyError::PayloadTooLarge);
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// deposit
// ---------------------------------------------------------------------------

/// Deposit funds and create an escrow entry keyed by `SHA256(owner || amount_due || salt)`.
///
/// - Transfers `amount` from `owner` to the contract.
/// - Sets `amount_due` to the target amount and `amount_paid` to the initial payment.
/// - Sets status to `Pending`.
/// - If `timeout_secs > 0`, the escrow expires `timeout_secs` seconds after creation.
///   Pass `0` for a non-expiring escrow.
/// - Optionally sets an `arbiter` who can resolve disputes.
///
/// # Errors
/// - [`InvalidAmount`] – amount ≤ 0.
/// - [`InvalidSalt`] – salt > 1024 bytes.
pub fn deposit(
    env: &Env,
    token: Address,
    amount: i128,
    owner: Address,
    salt: Bytes,
    timeout_secs: u64,
    arbiter: Option<Address>,
) -> Result<BytesN<32>,  RustAcademyError> {
    if amount <= 0 {
        return Err( RustAcademyError::InvalidAmount);
    }
    validate_deposit_resources(&salt, 0)?;

    owner.require_auth();

    // INV-3: validated, overflow-safe expiry computation
    let expires_at = compute_expires_at(env, timeout_secs)?;

    // Issue #304: deterministic escrow id over the full creation payload.
    // If an identical request has already been recorded, return the
    // existing commitment instead of creating a duplicate escrow.
    let escrow_id =
        escrow_id::derive_escrow_id(env, &token, amount, &owner, &salt, timeout_secs, &arbiter)?;
    if let Some(existing) = get_escrow_id_mapping(env, &escrow_id) {
        return Ok(existing);
    }

    let (commitment, legacy_commitment) =
        commitment::amount_commitment_hashes(env, &owner, amount, &salt)?;
    let now = env.ledger().timestamp();

    // optimized: build client first (borrows token), then move token into entry
    // commitment converted to Bytes once, reused
    let token_client = token::Client::new(env, &token);
    let commitment_bytes: Bytes = commitment.clone().into();
    if has_escrow(env, &commitment_bytes) {
        return Err( RustAcademyError::CommitmentAlreadyExists);
    }
    if legacy_commitment != commitment {
        let legacy_commitment_bytes: Bytes = legacy_commitment.into();
        if has_escrow(env, &legacy_commitment_bytes) {
            return Err( RustAcademyError::CommitmentAlreadyExists);
        }
    }
    let entry = EscrowEntry {
        token, // moved
        amount_due: amount,
        amount_paid: amount, // Initial payment is the full amount
        owner: owner.clone(),
        status: EscrowStatus::Pending,
        created_at: now,
        expires_at,
        arbiter,
        arbiters: Vec::new(env),
        arbiter_threshold: 0,
        schema_version: crate::types::ESCROW_SCHEMA_VERSION,
    };

    put_escrow(env, &commitment_bytes, &entry);
    put_escrow_id_mapping(env, &escrow_id, &commitment);
    // Reverse index so terminal cleanup can drop the dedup mapping (Issue #51).
    put_commitment_escrow_id(env, &commitment_bytes, &escrow_id);
    token_client.transfer(&owner, env.current_contract_address(), &amount);

    let token_address = token_client.address.clone();
    events::publish_escrow_deposited(
        env,
        commitment.clone(),
        owner.clone(),
        token_address.clone(),
        amount,
        amount,
        expires_at,
    );

    hook::invoke_hooks(
        env,
        HookEventKind::Create,
        &commitment,
        owner,
        token_address,
        amount,
        0,
    );

    Ok(commitment)
}

// ---------------------------------------------------------------------------
// deposit_with_arbiters
// ---------------------------------------------------------------------------

/// Maximum number of arbiters allowed in a multi-sig escrow.
pub const MAX_ARBITERS: u32 = 10;

/// Create a multi-signature (M-of-N) escrow where `threshold` of `arbiters` must
/// vote to resolve any dispute.
///
/// - Transfers `amount` from `owner` to the contract.
/// - Sets `arbiters` and `arbiter_threshold` on the entry (multi-sig mode).
/// - `arbiter` field is set to `None`; resolution goes through `vote_for_dispute`.
///
/// # Errors
/// - [`InvalidAmount`] – amount ≤ 0.
/// - [`InvalidSalt`] – salt > 1024 bytes.
/// - [`InvalidThreshold`] – threshold is 0, empty arbiters list, or threshold > len(arbiters).
/// - [`DuplicateArbiter`] – the arbiters list contains a duplicate address.
/// - [`TooManyArbiters`] – the arbiters list exceeds [`MAX_ARBITERS`].
/// - [`CommitmentAlreadyExists`] – a commitment with the same key already exists.
#[allow(clippy::too_many_arguments)]
pub fn deposit_with_arbiters(
    env: &Env,
    token: Address,
    amount: i128,
    owner: Address,
    salt: Bytes,
    timeout_secs: u64,
    arbiters: Vec<Address>,
    threshold: u32,
) -> Result<BytesN<32>,  RustAcademyError> {
    if amount <= 0 {
        return Err( RustAcademyError::InvalidAmount);
    }
    validate_deposit_resources(&salt, arbiters.len())?;
    if arbiters.is_empty() || threshold == 0 {
        return Err( RustAcademyError::InvalidThreshold);
    }
    let arbiter_count = arbiters.len();
    if threshold > arbiter_count {
        return Err( RustAcademyError::InvalidThreshold);
    }
    if arbiter_count > MAX_ARBITERS {
        return Err( RustAcademyError::TooManyArbiters);
    }

    // Reject duplicate arbiters (O(n²) is fine for small n ≤ MAX_ARBITERS).
    for i in 0..arbiter_count {
        for j in (i + 1)..arbiter_count {
            if arbiters.get_unchecked(i) == arbiters.get_unchecked(j) {
                return Err( RustAcademyError::DuplicateArbiter);
            }
        }
    }

    owner.require_auth();

    let expires_at = compute_expires_at(env, timeout_secs)?;

    // Use a sentinel None arbiter for escrow_id derivation — the arbiters vec
    // is stored in the entry but not part of the dedup key (matching `deposit`).
    let escrow_id =
        escrow_id::derive_escrow_id(env, &token, amount, &owner, &salt, timeout_secs, &None)?;
    if let Some(existing) = get_escrow_id_mapping(env, &escrow_id) {
        return Ok(existing);
    }

    let (commitment, legacy_commitment) =
        commitment::amount_commitment_hashes(env, &owner, amount, &salt)?;
    let commitment_bytes: Bytes = commitment.clone().into();
    if has_escrow(env, &commitment_bytes) {
        return Err( RustAcademyError::CommitmentAlreadyExists);
    }
    if legacy_commitment != commitment {
        let legacy_bytes: Bytes = legacy_commitment.into();
        if has_escrow(env, &legacy_bytes) {
            return Err( RustAcademyError::CommitmentAlreadyExists);
        }
    }

    let now = env.ledger().timestamp();
    let token_client = token::Client::new(env, &token);
    let commitment_bytes_ref = commitment_bytes.clone();

    let entry = EscrowEntry {
        token, // moved
        amount_due: amount,
        amount_paid: amount,
        owner: owner.clone(),
        status: EscrowStatus::Pending,
        created_at: now,
        expires_at,
        arbiter: None,
        arbiters,
        arbiter_threshold: threshold,
        schema_version: crate::types::ESCROW_SCHEMA_VERSION,
    };

    put_escrow(env, &commitment_bytes, &entry);
    put_escrow_id_mapping(env, &escrow_id, &commitment);
    put_commitment_escrow_id(env, &commitment_bytes_ref, &escrow_id);
    token_client.transfer(&owner, env.current_contract_address(), &amount);

    let token_addr = token_client.address.clone();
    events::publish_escrow_deposited(
        env,
        commitment.clone(),
        owner.clone(),
        token_addr.clone(),
        amount,
        amount,
        expires_at,
    );

    hook::invoke_hooks(
        env,
        HookEventKind::Create,
        &commitment,
        owner,
        token_addr,
        amount,
        0,
    );

    Ok(commitment)
}

// ---------------------------------------------------------------------------
// deposit_with_commitment
// ---------------------------------------------------------------------------

/// Deposit using a pre-generated 32-byte commitment hash.
///
/// - Validates commitment uniqueness.
/// - If `timeout_secs > 0`, the escrow expires after that many seconds.
/// - Optionally sets an `arbiter` who can resolve disputes.
///
/// # Errors
/// - [`InvalidAmount`] – amount ≤ 0.
/// - [`CommitmentAlreadyExists`] – commitment already in storage.
/// - [`InvalidTimeout`] – timeout_secs would overflow u64 when added to now.
pub fn deposit_with_commitment(
    env: &Env,
    from: Address,
    token: Address,
    amount: i128,
    commitment: BytesN<32>,
    timeout_secs: u64,
    arbiter: Option<Address>,
) -> Result<(),  RustAcademyError> {
    if amount <= 0 {
        return Err( RustAcademyError::InvalidAmount);
    }
    validate_deposit_resources(&Bytes::new(env), 0)?;

    from.require_auth();

    // INV-3: validated, overflow-safe expiry computation
    let expires_at = compute_expires_at(env, timeout_secs)?;

    // optimized: convert commitment once, move args into entry
    let commitment_bytes: Bytes = commitment.clone().into();
    if has_escrow(env, &commitment_bytes) {
        return Err( RustAcademyError::CommitmentAlreadyExists);
    }

    let token_client = token::Client::new(env, &token);
    token_client.transfer(&from, env.current_contract_address(), &amount);

    let now = env.ledger().timestamp();

    let from_ref = from.clone();
    let entry = EscrowEntry {
        token, // moved
        amount_due: amount,
        amount_paid: amount, // Initial payment is the full amount
        owner: from,         // moved
        status: EscrowStatus::Pending,
        created_at: now,
        expires_at,
        arbiter,
        arbiters: Vec::new(env),
        arbiter_threshold: 0,
        schema_version: crate::types::ESCROW_SCHEMA_VERSION,
    };

    put_escrow(env, &commitment_bytes, &entry);
    let token_addr = token_client.address.clone();
    events::publish_escrow_deposited(
        env,
        commitment.clone(),
        from_ref.clone(),
        token_addr.clone(),
        amount,
        amount,
        expires_at,
    );

    hook::invoke_hooks(
        env,
        HookEventKind::Create,
        &commitment,
        from_ref,
        token_addr,
        amount,
        0,
    );

    Ok(())
}

// ---------------------------------------------------------------------------
// deposit_partial
// ---------------------------------------------------------------------------

/// Deposit funds and create an escrow entry with a target amount higher than the initial payment.
///
/// - Transfers `initial_payment` from `owner` to the contract.
/// - Sets `amount_due` to the target amount and `amount_paid` to the initial payment.
/// - Sets status to `Pending`.
/// - If `timeout_secs > 0`, the escrow expires `timeout_secs` seconds after creation.
///   Pass `0` for a non-expiring escrow.
/// - Optionally sets an `arbiter` who can resolve disputes.
///
/// # Errors
/// - [`InvalidAmount`] – initial_payment ≤ 0 or amount_due ≤ 0.
/// - [`InvalidSalt`] – salt > 1024 bytes.
#[allow(clippy::too_many_arguments)]
pub fn deposit_partial(
    env: &Env,
    token: Address,
    amount_due: i128,
    initial_payment: i128,
    owner: Address,
    salt: Bytes,
    timeout_secs: u64,
    arbiter: Option<Address>,
) -> Result<BytesN<32>,  RustAcademyError> {
    if initial_payment <= 0 {
        return Err( RustAcademyError::InvalidAmount);
    }
    if amount_due <= 0 {
        return Err( RustAcademyError::InvalidAmount);
    }
    validate_deposit_resources(&salt, 0)?;

    owner.require_auth();

    // INV-3: validated, overflow-safe expiry computation
    let expires_at = compute_expires_at(env, timeout_secs)?;

    // Derive a deterministic escrow_id that includes initial_payment so
    // identical retries are detected and idempotently return the existing
    // commitment without creating a duplicate entry.
    let escrow_id = escrow_id::derive_partial_escrow_id(
        env,
        &token,
        amount_due,
        initial_payment,
        &owner,
        &salt,
        timeout_secs,
        &arbiter,
    )?;
    if let Some(existing) = get_escrow_id_mapping(env, &escrow_id) {
        return Ok(existing);
    }

    let (commitment, legacy_commitment) =
        commitment::amount_commitment_hashes(env, &owner, amount_due, &salt)?;
    let commitment_bytes: Bytes = commitment.clone().into();

    // Reject duplicate commitment to prevent overwriting an existing escrow.
    if has_escrow(env, &commitment_bytes) {
        return Err( RustAcademyError::CommitmentAlreadyExists);
    }
    if legacy_commitment != commitment {
        let legacy_bytes: Bytes = legacy_commitment.into();
        if has_escrow(env, &legacy_bytes) {
            return Err( RustAcademyError::CommitmentAlreadyExists);
        }
    }

    let now = env.ledger().timestamp();
    let token_client = token::Client::new(env, &token);
    let entry = EscrowEntry {
        token, // moved
        amount_due,
        amount_paid: initial_payment,
        owner: owner.clone(),
        status: EscrowStatus::Pending,
        created_at: now,
        expires_at,
        arbiter,
        arbiters: Vec::new(env),
        arbiter_threshold: 0,
        schema_version: crate::types::ESCROW_SCHEMA_VERSION,
    };

    put_escrow(env, &commitment_bytes, &entry);
    // Store forward (escrow_id → commitment) and reverse (commitment → escrow_id)
    // mappings so the backend indexer can correlate partial escrow events with
    // their stable IDs, and terminal cleanup can drop the dedup mapping.
    put_escrow_id_mapping(env, &escrow_id, &commitment);
    put_commitment_escrow_id(env, &commitment_bytes, &escrow_id);

    token_client.transfer(&owner, env.current_contract_address(), &initial_payment);

    let token_addr = token_client.address.clone();
    events::publish_escrow_deposited(
        env,
        commitment.clone(),
        owner.clone(),
        token_addr.clone(),
        amount_due,
        initial_payment,
        expires_at,
    );

    hook::invoke_hooks(
        env,
        HookEventKind::Create,
        &commitment,
        owner,
        token_addr,
        initial_payment,
        0,
    );

    Ok(commitment)
}

// ---------------------------------------------------------------------------
// partial_payment
// ---------------------------------------------------------------------------

/// Make a partial payment towards an existing escrow.
///
/// - Transfers `payment_amount` from `payer` to the contract.
/// - Increments `amount_paid` by the payment amount.
/// - Rejects overpayment (payment_amount > remaining amount due).
/// - Emits a `PartialPayment` event.
/// - If payment completes the escrow (amount_paid == amount_due), emits `EscrowFinalized`.
///
/// # Errors
/// - [`InvalidAmount`] – payment_amount ≤ 0.
/// - [`CommitmentNotFound`] – no escrow for the given commitment.
/// - [`AlreadySpent`] – escrow already in a terminal state.
/// - [`Overpayment`] – payment_amount exceeds the remaining amount due.
pub fn partial_payment(
    env: &Env,
    commitment: BytesN<32>,
    payer: Address,
    payment_amount: i128,
) -> Result<(),  RustAcademyError> {
    if payment_amount <= 0 {
        return Err( RustAcademyError::InvalidAmount);
    }

    payer.require_auth();

    let commitment_bytes: Bytes = commitment.clone().into();
    let mut entry: EscrowEntry =
        get_escrow(env, &commitment_bytes).ok_or( RustAcademyError::CommitmentNotFound)?;

    // INV-5: terminal states are final
    if entry.status != EscrowStatus::Pending {
        return Err( RustAcademyError::AlreadySpent);
    }

    // Calculate remaining amount due
    let remaining = entry.amount_due.saturating_sub(entry.amount_paid);

    // Reject overpayment
    if payment_amount > remaining {
        return Err( RustAcademyError::Overpayment);
    }

    // Transfer payment to contract
    let token_client = token::Client::new(env, &entry.token);
    token_client.transfer(&payer, env.current_contract_address(), &payment_amount);

    // Update amount_paid
    entry.amount_paid = entry.amount_paid.saturating_add(payment_amount);

    // Check if escrow is now fully paid
    let is_fully_paid = entry.amount_paid >= entry.amount_due;

    put_escrow(env, &commitment_bytes, &entry);

    // Emit partial payment event
    events::publish_partial_payment(
        env,
        commitment.clone(),
        payer.clone(),
        entry.token.clone(),
        payment_amount,
        entry.amount_paid,
        entry.amount_due,
    );

    // If fully paid, emit finalization event
    if is_fully_paid {
        events::publish_escrow_finalized(
            env,
            commitment,
            entry.owner,
            entry.token,
            entry.amount_paid,
        );
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// withdraw
// ---------------------------------------------------------------------------

/// Withdraw escrowed funds by proving commitment ownership.
///
/// The caller (`to`) must authorize. The commitment is recomputed from
/// `to`, `amount_due`, and `salt` and must match an existing pending escrow.
/// The escrow must be fully paid (amount_paid >= amount_due).
///
/// # Time-lock enforcement
/// Enforces INV-1: if `expires_at > 0` and ledger timestamp >= `expires_at`,
/// this function MUST fail. There is no admin override or bypass.
///
/// # Errors
/// - [`InvalidAmount`] – amount_due ≤ 0.
/// - [`CommitmentNotFound`] – no escrow for computed commitment.
/// - [`EscrowExpired`] – escrow has passed its expiry.
/// - [`AlreadySpent`] – escrow already spent or refunded.
/// - [`InvalidCommitment`] – stored amount_due ≠ requested amount_due.
/// - [`Overpayment`] – escrow is not fully paid yet.
pub fn withdraw(env: &Env, amount: i128, to: Address, salt: Bytes) -> Result<bool,  RustAcademyError> {
    if amount <= 0 {
        return Err( RustAcademyError::InvalidAmount);
    }

    to.require_auth();

    let (commitment, legacy_commitment) =
        commitment::amount_commitment_hashes(env, &to, amount, &salt)?;
    let commitment_bytes: Bytes = commitment.clone().into();

    let (commitment, commitment_bytes, entry): (BytesN<32>, Bytes, EscrowEntry) =
        if let Some(entry) = get_escrow(env, &commitment_bytes) {
            (commitment, commitment_bytes, entry)
        } else {
            let legacy_commitment_bytes: Bytes = legacy_commitment.clone().into();
            let entry = get_escrow(env, &legacy_commitment_bytes)
                .ok_or( RustAcademyError::CommitmentNotFound)?;
            (legacy_commitment, legacy_commitment_bytes, entry)
        };

    // INV-5: terminal states are final
    if entry.status != EscrowStatus::Pending {
        // Distinguish disputed (INV-4) from other terminal states (INV-5)
        if entry.status == EscrowStatus::Disputed {
            return Err( RustAcademyError::InvalidDisputeState);
        }
        return Err( RustAcademyError::AlreadySpent);
    }

    // INV-1: strictly enforce the time-lock — no bypass
    if !is_within_window(env, &entry) {
        return Err( RustAcademyError::EscrowExpired);
    }

    if entry.amount_due != amount {
        return Err( RustAcademyError::InvalidCommitment);
    }

    // Check if escrow is fully paid
    if entry.amount_paid < entry.amount_due {
        return Err( RustAcademyError::Overpayment);
    }
    validate_withdraw_resources(env, &entry.token, &salt)?;

    // optimized: destructure what we need, move entry instead of cloning
    let token_ref = entry.token.clone();
    let amount_paid = entry.amount_paid;
    let owner = entry.owner.clone();

    let mut updated = entry;
    updated.status = EscrowStatus::Spent;
    put_escrow(env, &commitment_bytes, &updated);

    let fee_breakdown = fee_router::route_payout(env, &token_ref, &to, amount_paid, None)?;

    events::publish_escrow_withdrawn(
        env,
        commitment.clone(),
        to.clone(),
        token_ref.clone(),
        amount_paid,
        fee_breakdown.total_fee,
        fee_breakdown.arbiter_fee,
        fee_breakdown.platform_fee,
        fee_breakdown.collector_fee,
        fee_breakdown.net_payout,
    );

    hook::invoke_hooks(
        env,
        HookEventKind::Settle,
        &commitment,
        owner,
        token_ref,
        amount_paid,
        fee_breakdown.total_fee,
    );

    Ok(true)
}

// ---------------------------------------------------------------------------
// refund
// ---------------------------------------------------------------------------

/// Refund an expired escrow back to its original owner.
///
/// - Only callable after `expires_at` has been reached (and `expires_at > 0`).
/// - Caller must be the original depositor (`entry.owner`).
/// - Escrow must still be `Pending`.
///
/// # Time-lock enforcement
/// Enforces INV-2: both conditions must hold simultaneously —
/// `expires_at > 0` (was set) AND `now >= expires_at` (has elapsed).
/// A non-expiring escrow (`expires_at == 0`) can never be refunded.
///
/// # Errors
/// - [`CommitmentNotFound`] – no escrow for the given commitment.
/// - [`AlreadySpent`] – escrow already in a terminal state (INV-5).
/// - [`InvalidDisputeState`] – escrow is disputed, funds locked (INV-4).
/// - [`EscrowNotExpired`] – expiry not set or not yet reached (INV-2).
/// - [`InvalidOwner`] – caller is not the original owner.
pub fn refund(env: &Env, commitment: BytesN<32>, caller: Address) -> Result<(),  RustAcademyError> {
    caller.require_auth();

    let commitment_bytes: Bytes = commitment.clone().into();
    let entry: EscrowEntry =
        get_escrow(env, &commitment_bytes).ok_or( RustAcademyError::CommitmentNotFound)?;

    // INV-5: terminal states are final
    if entry.status != EscrowStatus::Pending {
        // INV-4: disputed funds are locked — surface a more specific error
        if entry.status == EscrowStatus::Disputed {
            return Err( RustAcademyError::InvalidDisputeState);
        }
        return Err( RustAcademyError::AlreadySpent);
    }

    // INV-2: strictly enforce — both expires_at > 0 AND now >= expires_at must hold
    if !is_expired(env, &entry) {
        return Err( RustAcademyError::EscrowNotExpired);
    }

    if caller != entry.owner {
        return Err( RustAcademyError::InvalidOwner);
    }

    let token_ref = entry.token.clone();
    let owner_ref = entry.owner.clone();
    let amount_paid = entry.amount_paid;

    let mut updated = entry;
    updated.status = EscrowStatus::Refunded;
    put_escrow(env, &commitment_bytes, &updated);

    let token_client = token::Client::new(env, &token_ref);
    token_client.transfer(&env.current_contract_address(), &owner_ref, &amount_paid);

    events::publish_escrow_refunded(
        env,
        owner_ref.clone(),
        commitment.clone(),
        token_ref.clone(),
        amount_paid,
    );

    hook::invoke_hooks(
        env,
        HookEventKind::Refund,
        &commitment,
        owner_ref,
        token_ref,
        amount_paid,
        0,
    );

    Ok(())
}

// ---------------------------------------------------------------------------
// TTL & Cleanup
// ---------------------------------------------------------------------------

/// Extend the storage TTL of an escrow record.
///
/// Any user can call this to keep an escrow from being archived.
pub fn extend_escrow_ttl(env: &Env, commitment: BytesN<32>) -> Result<(),  RustAcademyError> {
    let commitment_bytes: Bytes = commitment.into();
    if !has_escrow(env, &commitment_bytes) {
        return Err( RustAcademyError::CommitmentNotFound);
    }

    env.storage().persistent().extend_ttl(
        &crate::storage::DataKey::Escrow(commitment_bytes),
        LEDGER_THRESHOLD,
        SIX_MONTHS_IN_LEDGERS,
    );
    Ok(())
}

/// Cleanup terminal escrow entries to reclaim storage deposits.
///
/// Only escrows in `Spent` or `Refunded` status can be removed.
/// Also removes the associated EscrowIdMap and any dispute votes
/// for Disputed escrows that were resolved before cleanup.
///
/// Issue #19: Bounded cleanup ensures no orphaned mappings remain.
pub fn cleanup_escrow(env: &Env, commitment: BytesN<32>) -> Result<(),  RustAcademyError> {
    let commitment_bytes: Bytes = commitment.clone().into();
    let entry: EscrowEntry =
        get_escrow(env, &commitment_bytes).ok_or( RustAcademyError::CommitmentNotFound)?;

    match entry.status {
        EscrowStatus::Spent | EscrowStatus::Refunded => {
            let mut indices_removed: u32 = 0;

            // Dedup mapping (escrow_id → commitment) plus its reverse index.
            if let Some(escrow_id) = get_commitment_escrow_id(env, &commitment_bytes) {
                remove_escrow_id_mapping(env, &escrow_id);
                remove_commitment_escrow_id(env, &commitment_bytes);
                indices_removed += 2;
            }

            // Remove dispute votes if this was a disputed escrow that was resolved.
            if matches!(entry.status, EscrowStatus::Refunded) && entry.arbiter.is_some() {
                // Single arbiter mode - remove the vote if it exists
                let arbiter = entry.arbiter.unwrap();
                let key = DataKey::DisputeVote(commitment_bytes.clone(), arbiter);
                if env.storage().persistent().has(&key) {
                    env.storage().persistent().remove(&key);
                    indices_removed += 1;
                }
            } else if entry.arbiter_threshold > 0 {
                // Multi-sig mode - remove all votes for this escrow
                for arbiter in entry.arbiters.iter() {
                    if has_dispute_vote(env, &commitment_bytes, &arbiter) {
                        indices_removed += 1;
                    }
                }
                remove_dispute_votes_for_escrow(env, &commitment_bytes, &entry.arbiters);
            }

            remove_escrow(env, &commitment_bytes);

            // Publish cleanup event for indexers
            events::publish_escrow_cleanup(env, commitment.clone());

            // Issue #49: reclaim dispute expiry metadata storage rent.
            clear_dispute_state(env, &commitment_bytes, &entry.arbiters);

            events::publish_aux_indices_cleaned(env, commitment, indices_removed);
            Ok(())
        }
        _ => Err( RustAcademyError::AlreadySpent), // Reuse error or add a more specific one if needed
    }
}

// ---------------------------------------------------------------------------
// dispute
// ---------------------------------------------------------------------------

/// Initiate a dispute for a pending escrow, locking the funds.
///
/// - Any participant can call this function.
/// - Requires an assigned arbiter.
/// - Escrow must be in `Pending` status.
/// - Changes status to `Disputed`, locking funds until resolution(INV4)
///
/// # Errors
/// - [`CommitmentNotFound`] – no escrow for the given commitment.
/// - [`NoArbiter`] – no arbiter assigned to the escrow.
/// - [`InvalidDisputeState`] – escrow is not in `Pending` status.
pub fn dispute(env: &Env, commitment: BytesN<32>) -> Result<(),  RustAcademyError> {
    let commitment_bytes: Bytes = commitment.clone().into();
    let entry: EscrowEntry =
        get_escrow(env, &commitment_bytes).ok_or( RustAcademyError::CommitmentNotFound)?;

    // Guard: must have an arbiter assigned
    let arbiter = entry.arbiter.as_ref().ok_or( RustAcademyError::NoArbiter)?;

    // Guard: escrow must be in Pending state
    if entry.status != EscrowStatus::Pending {
        return Err( RustAcademyError::InvalidDisputeState);
    }

    let mut updated = entry.clone();
    updated.status = EscrowStatus::Disputed;
    put_escrow(env, &commitment_bytes, &updated);

    // Issue #49: snapshot timeout and default expiry action at dispute creation.
    dispute::record_dispute_expiry(env, commitment.clone());

    events::publish_escrow_disputed(env, commitment.clone(), arbiter.clone());

    Ok(())
}

// ---------------------------------------------------------------------------
// resolve_dispute
// ---------------------------------------------------------------------------

/// Resolve a disputed escrow by determining the recipient of funds.
///
/// - Only callable by the assigned arbiter (or a globally authorized Arbiter role).
/// - Escrow must be in `Disputed` status (INV4).
/// - Arbiter decides whether funds go to owner (refund) or recipient (spend).
///
/// # Arguments
/// - `commitment`: The escrow commitment hash
/// - `resolve_for_owner`: If `true`, funds go to owner; if `false`, funds go to recipient
/// - `recipient`: Address to receive funds when `resolve_for_owner` is `false`
///
/// # Errors
/// - [`CommitmentNotFound`] – no escrow for the given commitment.
/// - [`NotArbiter`] – caller is not the assigned arbiter.
/// - [`InvalidDisputeState`] – escrow is not in `Disputed` status.
pub fn resolve_dispute(
    env: &Env,
    caller: Address,
    commitment: BytesN<32>,
    resolve_for_owner: bool,
    recipient: Address,
) -> Result<(),  RustAcademyError> {
    let commitment_bytes: Bytes = commitment.clone().into();
    let entry: EscrowEntry =
        get_escrow(env, &commitment_bytes).ok_or( RustAcademyError::CommitmentNotFound)?;

    // Guard: caller must be either the assigned arbiter OR have the global Arbiter role.
    caller.require_auth();
    let mut is_authorized = admin::has_role(env, &caller, Role::Arbiter);

    if !is_authorized {
        if let Some(assigned_arbiter) = &entry.arbiter {
            if *assigned_arbiter == caller {
                is_authorized = true;
            }
        }
    }

    if !is_authorized {
        return Err( RustAcademyError::NotArbiter);
    }

    // Guard: escrow must be in Disputed state
    if entry.status != EscrowStatus::Disputed {
        return Err( RustAcademyError::InvalidDisputeState);
    }

    let (final_status, recipient_address) = if resolve_for_owner {
        (EscrowStatus::Refunded, entry.owner.clone())
    } else {
        (EscrowStatus::Spent, recipient)
    };

    let mut updated = entry.clone();
    updated.status = final_status;
    put_escrow(env, &commitment_bytes, &updated);

    let fee_breakdown = if final_status == EscrowStatus::Spent {
        fee_router::route_payout(
            env,
            &entry.token,
            &recipient_address,
            entry.amount_paid,
            Some(&caller),
        )
    } else {
        // Refund path — no fee, direct transfer to owner.
        let token_client = token::Client::new(env, &entry.token);
        token_client.transfer(
            &env.current_contract_address(),
            &recipient_address,
            &entry.amount_paid,
        );
        Ok(fee_router::FeeBreakdown {
            net_payout: entry.amount_paid,
            total_fee: 0,
            arbiter_fee: 0,
            platform_fee: 0,
            collector_fee: 0,
        })
    }?;

    if resolve_for_owner {
        events::publish_escrow_refunded(
            env,
            entry.owner.clone(),
            commitment.clone(),
            entry.token.clone(),
            entry.amount_paid,
        );
        hook::invoke_hooks(
            env,
            HookEventKind::Refund,
            &commitment,
            entry.owner.clone(),
            entry.token.clone(),
            entry.amount_paid,
            0,
        );
    } else {
        events::publish_escrow_withdrawn(
            env,
            commitment.clone(),
            recipient_address.clone(),
            entry.token.clone(),
            entry.amount_paid,
            fee_breakdown.total_fee,
            fee_breakdown.arbiter_fee,
            fee_breakdown.platform_fee,
            fee_breakdown.collector_fee,
            fee_breakdown.net_payout,
        );
        hook::invoke_hooks(
            env,
            HookEventKind::Settle,
            &commitment,
            entry.owner.clone(),
            entry.token,
            entry.amount_paid,
            fee_breakdown.total_fee,
        );
    }

    // Issue #49: remove stale dispute votes and expiry metadata after resolution.
    clear_dispute_state(env, &commitment_bytes, &entry.arbiters);

    Ok(())
}

// ---------------------------------------------------------------------------
// vote_for_dispute (multi-sig)
// ---------------------------------------------------------------------------

/// Cast a vote on a disputed escrow (multi-sig mode).
///
/// - Only callable by one of the assigned arbiters.
/// - Escrow must be in `Disputed` status.
/// - Each arbiter can only vote once per dispute.
/// - Does not resolve the dispute immediately; only records the vote.
/// - When the threshold is reached, the dispute can be resolved via `resolve_dispute_multi_sig`.
///
/// # Arguments
/// - `caller`: The arbiter casting the vote
/// - `commitment`: The escrow commitment hash
/// - `resolve_for_owner`: If `true`, voting to refund to owner; if `false`, voting to pay recipient
///
/// # Errors
/// - [`CommitmentNotFound`] – no escrow for the given commitment.
/// - [`InvalidDisputeState`] – escrow is not in `Disputed` status.
/// - [`NotAnArbiter`] – caller is not one of the assigned arbiters.
/// - [`ArbiterAlreadyVoted`] – caller has already voted on this dispute.
pub fn vote_for_dispute(
    env: &Env,
    caller: Address,
    commitment: BytesN<32>,
    resolve_for_owner: bool,
) -> Result<(),  RustAcademyError> {
    caller.require_auth();

    let commitment_bytes: Bytes = commitment.clone().into();
    let entry: EscrowEntry =
        get_escrow(env, &commitment_bytes).ok_or( RustAcademyError::CommitmentNotFound)?;

    // Guard: escrow must be in Disputed state
    if entry.status != EscrowStatus::Disputed {
        return Err( RustAcademyError::InvalidDisputeState);
    }

    // Guard: must be in multi-sig mode (threshold > 0)
    if entry.arbiter_threshold == 0 {
        return Err( RustAcademyError::NoArbiter);
    }

    // Guard: caller must be one of the assigned arbiters
    let mut is_arbiter = false;
    for arbiter in entry.arbiters.iter() {
        if arbiter == caller {
            is_arbiter = true;
            break;
        }
    }

    // Also check global Arbiter role
    if !is_arbiter {
        is_arbiter = admin::has_role(env, &caller, Role::Arbiter);
    }

    if !is_arbiter {
        return Err( RustAcademyError::NotAnArbiter);
    }

    // Guard: arbiter must not have already voted
    if has_dispute_vote(env, &commitment_bytes, &caller) {
        return Err( RustAcademyError::ArbiterAlreadyVoted);
    }

    // Record the vote
    let vote = DisputeVote {
        arbiter: caller.clone(),
        resolve_for_owner,
        voted_at: env.ledger().timestamp(),
    };

    put_dispute_vote(env, &commitment_bytes, &caller, &vote);

    // Count current votes
    let vote_count = count_dispute_votes(env, &commitment_bytes, &entry.arbiters);

    // Emit vote cast event
    events::publish_arbiter_vote_cast(
        env,
        commitment,
        caller,
        resolve_for_owner,
        vote_count,
        entry.arbiter_threshold,
    );

    Ok(())
}

// ---------------------------------------------------------------------------
// resolve_dispute_multi_sig
// ---------------------------------------------------------------------------

/// Resolve a disputed escrow using multi-sig arbitration.
///
/// - Can be called by anyone once the threshold is met.
/// - Escrow must be in `Disputed` status.
/// - Requires that the number of votes >= threshold.
/// - Determines the outcome based on majority vote among the votes cast.
///
/// # Arguments
/// - `commitment`: The escrow commitment hash
/// - `recipient`: Address to receive funds when resolving for recipient
///
/// # Errors
/// - [`CommitmentNotFound`] – no escrow for the given commitment.
/// - [`InvalidDisputeState`] – escrow is not in `Disputed` status.
/// - [`InsufficientVotes`] – threshold has not been reached yet.
pub fn resolve_dispute_multi_sig(
    env: &Env,
    commitment: BytesN<32>,
    recipient: Address,
) -> Result<(),  RustAcademyError> {
    let commitment_bytes: Bytes = commitment.clone().into();
    let entry: EscrowEntry =
        get_escrow(env, &commitment_bytes).ok_or( RustAcademyError::CommitmentNotFound)?;

    // Guard: escrow must be in Disputed state
    if entry.status != EscrowStatus::Disputed {
        return Err( RustAcademyError::InvalidDisputeState);
    }

    // Guard: must be in multi-sig mode
    if entry.arbiter_threshold == 0 {
        return Err( RustAcademyError::NoArbiter);
    }

    // Count votes
    let vote_count = count_dispute_votes(env, &commitment_bytes, &entry.arbiters);

    // Guard: threshold must be met
    if vote_count < entry.arbiter_threshold {
        return Err( RustAcademyError::InsufficientVotes);
    }

    // Count votes for each side
    let mut votes_for_owner: u32 = 0;
    let mut votes_for_recipient: u32 = 0;

    for arbiter in entry.arbiters.iter() {
        if let Some(vote) = get_dispute_vote(env, &commitment_bytes, &arbiter) {
            if vote.resolve_for_owner {
                votes_for_owner += 1;
            } else {
                votes_for_recipient += 1;
            }
        }
    }

    // Determine outcome by majority
    let resolve_for_owner = votes_for_owner >= votes_for_recipient;

    let (final_status, recipient_address) = if resolve_for_owner {
        (EscrowStatus::Refunded, entry.owner.clone())
    } else {
        (EscrowStatus::Spent, recipient)
    };

    let mut updated = entry.clone();
    updated.status = final_status;
    put_escrow(env, &commitment_bytes, &updated);

    let fee_breakdown = if final_status == EscrowStatus::Spent {
        fee_router::route_payout(
            env,
            &entry.token,
            &recipient_address,
            entry.amount_paid,
            None,
        )
    } else {
        let token_client = token::Client::new(env, &entry.token);
        token_client.transfer(
            &env.current_contract_address(),
            &recipient_address,
            &entry.amount_paid,
        );
        Ok(fee_router::FeeBreakdown {
            net_payout: entry.amount_paid,
            total_fee: 0,
            arbiter_fee: 0,
            platform_fee: 0,
            collector_fee: 0,
        })
    }?;

    // Emit dispute resolved event
    events::publish_dispute_resolved(
        env,
        commitment.clone(),
        resolve_for_owner,
        vote_count,
        entry.arbiter_threshold,
        entry.amount_paid,
    );

    if resolve_for_owner {
        events::publish_escrow_refunded(
            env,
            entry.owner.clone(),
            commitment.clone(),
            entry.token.clone(),
            entry.amount_paid,
        );
        hook::invoke_hooks(
            env,
            HookEventKind::Refund,
            &commitment,
            entry.owner.clone(),
            entry.token.clone(),
            entry.amount_paid,
            0,
        );
    } else {
        events::publish_escrow_withdrawn(
            env,
            commitment.clone(),
            recipient_address.clone(),
            entry.token.clone(),
            entry.amount_paid,
            fee_breakdown.total_fee,
            fee_breakdown.arbiter_fee,
            fee_breakdown.platform_fee,
            fee_breakdown.collector_fee,
            fee_breakdown.net_payout,
        );
        hook::invoke_hooks(
            env,
            HookEventKind::Settle,
            &commitment,
            entry.owner.clone(),
            entry.token,
            entry.amount_paid,
            fee_breakdown.total_fee,
        );
    }

    // Issue #49: remove stale dispute votes and expiry metadata after resolution.
    clear_dispute_state(env, &commitment_bytes, &entry.arbiters);

    Ok(())
}