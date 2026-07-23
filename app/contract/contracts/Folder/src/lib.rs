#![no_std]
use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env, Vec};

mod admin;
#[cfg(test)]
mod bench_test;
mod commitment;
#[cfg(test)]
mod commitment_test;
mod dispute;
mod errors;
mod escrow;
mod escrow_id;
#[cfg(test)]
mod escrow_id_test;
mod events;
#[cfg(test)]
mod events_test;
mod fee;
mod fee_router;
#[cfg(test)]
mod fee_router_test;
#[cfg(test)]
mod fee_test;
#[cfg(test)]
mod fuzz_test;
mod hook;
mod metadata;
#[cfg(test)]
mod metadata_test;
pub mod nonce;
#[cfg(test)]
mod nonce_test;
mod oracle;
mod privacy;
mod legacy_privacy;
#[cfg(test)]
mod role_test;
mod stealth;
#[cfg(test)]
mod stealth_test;
mod storage;
#[cfg(test)]
mod storage_test;
#[cfg(test)]
mod test;
#[cfg(test)]
mod test_context;
mod types;
#[cfg(test)]
mod upgrade_test;

use errors::RustAcademyError;
use storage::*;
use privacy::{add_privacy_history, get_privacy_history, get_privacy_level, set_privacy_level};
use types::{
    ContractHealth, DeploymentMetadata, DisputeExpiryAction, EscrowEntry,
    EscrowOperationEstimate, EscrowOperationLimits, EscrowStatus, FeatureFlags, FeeConfig,
    OracleFeeConfig, PerAssetFeeConfig, PrivacyAwareEscrowView, Role, SchemaCompatibility,
    StealthDepositParams, SupportedVersions, UpgradeState,
};

pub use types::FeeRatio;

///  RustAcademy Privacy Contract
///
/// Soroban smart contract providing escrow, privacy controls, and X-Ray-style amount
/// commitments for the  RustAcademy platform. See the contract README for main flows.
///
/// ## Asset Support
///
/// This contract supports both Native XLM and Stellar Asset Contract (SAC) tokens:
/// - **Native XLM**: The native lumens of the Stellar network. Use the stellar
///   network's native asset address when calling deposit functions.
/// - **SAC Tokens**: Any token implemented via Stellar Asset Contracts (e.g., USDC,
///   custom tokens). Use the SAC contract address as the token parameter.
///
/// The contract uses Soroban's standardized token interface which works uniformly across
/// all asset types. No special wrap/unwrap logic is required from users.
///
/// ## Supported Escrow Limits
///
/// The contract publishes bounded escrow limits through
/// [`RustAcademyContract::get_escrow_operation_limits`]. The current supported
/// envelopes are:
/// - deposit token transfers: 1
/// - deposit arbiters: up to 10
/// - deposit fee recipients: 0
/// - withdraw token transfers: 1
/// - withdraw fee recipients: up to 3
/// - deposit/withdraw salt bytes: up to 512 for predictable execution
///
/// Requests outside those bounds fail with explicit contract errors instead of
/// consuming unbounded Soroban resources.
///
/// ## Escrow State Machine
///
/// ```text
/// [*] --> Pending  : deposit() / deposit_with_commitment()
/// Pending --> Spent    : withdraw(proof)  [now < expires_at, or no expiry]
/// Pending --> Refunded : refund(owner)    [now >= expires_at]
/// Pending --> Disputed : dispute()        [any participant can call]
/// Disputed --> Spent   : resolve_dispute() [arbiter decides for recipient]
/// Disputed --> Refunded: resolve_dispute() [arbiter decides for owner]
/// ```
///
/// ## Access Model (Issue #53)
///
/// Every public entry point falls into one access class, and every
/// state-mutating method is gated accordingly. Unauthorized calls fail with a
/// stable error code rather than silently succeeding.
///
/// | Class      | Gate                                             | Methods (examples) |
/// |------------|--------------------------------------------------|--------------------|
/// | **Admin**  | `require_admin` (+ `require_initialized`)         | `set_paused`, `pause_features`, `set_fee_config`, `set_admin`, `migrate`, `upgrade`, `start/complete/cancel_upgrade`, `grant/revoke_role`, `rotate_fee_collector` |
/// | **Owner**  | caller `require_auth()`                            | `deposit*`, `withdraw`, `refund`, `set_privacy`, `enable_privacy`, `stealth_withdraw` |
/// | **Arbiter**| arbiter `require_auth()` + membership check       | `resolve_dispute`, `vote_for_dispute`, `resolve_dispute_multi_sig` |
/// | **Public** | none (read-only / pure)                           | `get_*`, `privacy_status`, `privacy_history`, `verify_amount_commitment`, `health_check` |
///
/// ### Mode gating
///
/// - **Global pause** (`is_paused`) and **per-feature pause** ([`PauseFlag`])
///   block the corresponding state-mutating operations with
///   [`OperationPaused`](errors::RustAcademyError::OperationPaused) /
///   [`ContractPaused`](errors::RustAcademyError::ContractPaused).
/// - **Emergency mode** blocks deposits and freezes admin/pause configuration
///   changes once activated (it is irreversible).
/// - **Upgrade in progress** restricts the upgrade lifecycle methods.
///
/// Read-only getters remain callable in every mode by design.
#[contract]
pub struct RustAcademyContract;

#[contractimpl]
#[allow(clippy::too_many_arguments)]
impl RustAcademyContract {
    /// Withdraw escrowed funds by proving commitment ownership.
    ///
    /// The caller (`to`) must authorize; the commitment is recomputed from `to`, `amount`, and `salt`
    /// and must match an existing pending escrow entry.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `_token` - Reserved; token is stored in the escrow entry
    /// * `amount` - Amount to withdraw; must be positive and match the escrow amount
    /// * `commitment` - Commitment hash for the escrow being withdrawn
    /// * `to` - Recipient address (must authorize the call)
    /// * `salt` - Salt used when creating the original deposit commitment
    ///
    /// # Errors
    /// * `InvalidAmount` - Amount is zero or negative
    /// * `ContractPaused` - Contract is currently paused
    /// * `CommitmentMismatch` - Provided commitment does not match (`to`, `amount`, `salt`)
    /// * `CommitmentNotFound` - No escrow exists for the provided commitment
    /// * `EscrowExpired` - Escrow has passed its expiry timestamp
    /// * `AlreadySpent` - Escrow has already been withdrawn or refunded
    /// * `InvalidCommitment` - Escrow amount does not match the requested amount
    pub fn withdraw(
        env: Env,
        _token: &Address,
        amount: i128,
        _commitment: BytesN<32>,
        to: Address,
        salt: Bytes,
    ) -> Result<bool, RustAcademyError> {
        admin::guard_withdraw(&env, PauseFlag::Withdrawal)?;
        escrow::withdraw(&env, amount, to, salt)
    }

    /// Set a numeric privacy level for an account (legacy/level-based API).
    ///
    /// Records the level in storage and appends it to the account's privacy history.
    /// For boolean on/off privacy, prefer [`set_privacy`]( RustAcademyContract::set_privacy).
    ///
    /// Access: **owner** — `account` must authorize the call. Gated by the
    /// [`PauseFlag::SetPrivacy`] feature flag.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `account` - The account to configure (must authorize)
    /// * `privacy_level` - Numeric level (0 = off, higher = more privacy; interpretation is application-specific)
    ///
    /// # Errors
    /// * `OperationPaused` - The `SetPrivacy` feature is paused.
    pub fn enable_privacy(
        env: Env,
        account: Address,
        privacy_level: u32,
    ) -> Result<bool, RustAcademyError> {
        // Owner-gated: only the account itself may change its privacy level.
        // Previously this method had no authorization, letting any caller write
        // another account's privacy level and history (Issue #53).
        account.require_auth();
        if is_feature_paused(&env, PauseFlag::SetPrivacy) {
            return Err(RustAcademyError::OperationPaused);
        }
        set_privacy_level(&env, &account, privacy_level);
        add_privacy_history(&env, &account, privacy_level);
        Ok(true)
    }

    /// Get the current numeric privacy level for an account.
    ///
    /// Returns `None` if no level has been set.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `account` - The account to query
    pub fn privacy_status(env: Env, account: Address) -> Option<u32> {
        get_privacy_level(&env, &account)
    }

    /// Get the history of privacy level changes for an account.
    ///
    /// Returns a vector of levels in chronological order (oldest first).
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `account` - The account to query
    pub fn privacy_history(env: Env, account: Address) -> Vec<u32> {
        get_privacy_history(&env, &account)
    }

    /// Enable or disable privacy for an account.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `owner` - The account address to configure
    /// * `enabled` - `true` to enable privacy, `false` to disable
    ///
    /// # Errors
    /// * `ContractPaused` - Contract is currently paused
    /// * `PrivacyAlreadySet` - Privacy state is already at the requested value
    pub fn set_privacy(env: Env, owner: Address, enabled: bool) -> Result<(), RustAcademyError> {
        admin::guard_initialized(&env)?;
        if is_feature_paused(&env, PauseFlag::SetPrivacy) {
            return Err(RustAcademyError::OperationPaused);
        }
        privacy::set_privacy(&env, owner, enabled)
    }

    /// Check the current privacy status of an account
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `owner` - The account address to query
    ///
    /// # Returns
    /// * `bool` - Current privacy status (true = enabled)
    pub fn get_privacy(env: Env, owner: Address) -> bool {
        privacy::get_privacy(&env, owner)
    }

    /// Deposit funds and create an escrow entry keyed by `KECCAK256(owner || amount || salt)`.
    ///
    /// Transfers `amount` from `owner` to the contract and stores an escrow entry.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `token` - The token contract address
    /// * `amount` - Amount to deposit; must be positive
    /// * `owner` - Owner of the funds (must authorize)
    /// * `salt` - Random salt (0–1024 bytes) for uniqueness
    /// * `timeout_secs` - Seconds from now until the escrow expires (0 = no expiry)
    /// * `arbiter` - Optional arbiter address who can resolve disputes
    ///
    /// # Errors
    /// * `InvalidAmount` - Amount is zero or negative
    /// * `InvalidSalt` - Salt length exceeds 1024 bytes
    /// * `ContractPaused` - Contract is currently paused
    /// * `CommitmentAlreadyExists` - An escrow for this commitment already exists
    pub fn deposit(
        env: Env,
        token: Address,
        amount: i128,
        owner: Address,
        salt: Bytes,
        timeout_secs: u64,
        arbiter: Option<Address>,
    ) -> Result<BytesN<32>, RustAcademyError> {
        admin::guard_deposit(&env, PauseFlag::Deposit)?;
        escrow::deposit(&env, token, amount, owner, salt, timeout_secs, arbiter)
    }

    /// Derive a deterministic 32-byte escrow id from the full creation payload.
    ///
    /// Issue #304: enables duplicate detection and idempotent re-submission.
    /// Same inputs always yield the same id; any change to `token`, `amount`,
    /// `owner`, `salt`, `timeout_secs`, or `arbiter` yields a different id
    /// (see [`escrow_id`] module for the canonical serialization).
    ///
    /// # Errors
    /// * `InvalidAmount` - Amount is negative
    /// * `InvalidSalt` - Salt length exceeds 1024 bytes
    pub fn derive_escrow_id(
        env: Env,
        token: Address,
        amount: i128,
        owner: Address,
        salt: Bytes,
        timeout_secs: u64,
        arbiter: Option<Address>,
    ) -> Result<BytesN<32>, RustAcademyError> {
        escrow_id::derive_escrow_id(&env, &token, amount, &owner, &salt, timeout_secs, &arbiter)
    }

    /// Look up the escrow commitment associated with a deterministic `escrow_id`.
    ///
    /// Returns `None` if no escrow has been created for this id yet.
    pub fn get_escrow_id_commitment(env: Env, escrow_id: BytesN<32>) -> Option<BytesN<32>> {
        storage::get_escrow_id_mapping(&env, &escrow_id)
    }

    /// Create a deterministic commitment hash for an amount (off-chain / pre-deposit use).
    ///
    /// Computes `KECCAK256(owner || amount || salt)`. Not a zero-knowledge proof; same inputs
    /// always yield the same hash. Legacy `SHA256(owner || amount || salt)` commitments remain
    /// accepted by verification paths for backwards compatibility.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `owner` - The owner address
    /// * `amount` - Non-negative amount in token base units
    /// * `salt` - Random bytes (0–1024 bytes) for uniqueness
    ///
    /// # Errors
    /// * `InvalidAmount` - Amount is negative
    /// * `InvalidSalt` - Salt length exceeds 1024 bytes
    pub fn create_amount_commitment(
        env: Env,
        owner: Address,
        amount: i128,
        salt: Bytes,
    ) -> Result<BytesN<32>, RustAcademyError> {
        if is_feature_paused(&env, PauseFlag::CreateAmountCommitment) {
            return Err(RustAcademyError::OperationPaused);
        }
        commitment::create_amount_commitment(&env, owner, amount, salt)
    }

    /// Verify that a commitment hash matches the given `owner`, `amount`, and `salt`.
    ///
    /// Recomputes the commitment and compares. Returns `false` if inputs are invalid or don't match.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `commitment` - 32-byte commitment hash to verify
    /// * `owner` - Claimed owner
    /// * `amount` - Claimed amount (must be non-negative)
    /// * `salt` - Salt used when creating the commitment
    pub fn verify_amount_commitment(
        env: Env,
        commitment: BytesN<32>,
        owner: Address,
        amount: i128,
        salt: Bytes,
    ) -> bool {
        commitment::verify_amount_commitment(&env, commitment, owner, amount, salt)
    }

    /// Create an escrow record and increment the global escrow counter.
    ///
    /// Returns the new counter value. Parameters `_from`, `_to`, `_amount` are reserved for
    /// future use; the implementation only increments the counter.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `_from` - Reserved (depositor address for future use)
    /// * `_to` - Reserved (recipient address for future use)
    /// * `_amount` - Reserved (amount for future use)
    pub fn create_escrow(env: Env, _from: Address, _to: Address, _amount: u64) -> u64 {
        increment_escrow_counter(&env)
    }

    /// Health check for deployment and monitoring.
    ///
    /// Returns `true` if the contract is deployed and callable. No state or auth required.
    pub fn health_check() -> bool {
        true
    }

    /// Deposit funds using a pre-generated 32-byte commitment hash.
    ///
    /// Transfers `amount` from `from` to the contract and stores an escrow keyed by
    /// `commitment`. The depositor must authorize. Use when the commitment was created
    /// off-chain or via [`create_amount_commitment`]( RustAcademyContract::create_amount_commitment).
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `from` - Depositor (must authorize the token transfer)
    /// * `token` - Token contract address
    /// * `amount` - Amount to deposit; must be positive
    /// * `commitment` - 32-byte commitment hash (must be unique)
    /// * `timeout_secs` - Seconds from now until the escrow expires (0 = no expiry)
    /// * `arbiter` - Optional arbiter address who can resolve disputes
    ///
    /// # Errors
    /// * `InvalidAmount` - Amount is zero or negative
    /// * `ContractPaused` - Contract is currently paused
    /// * `CommitmentAlreadyExists` - An escrow for this commitment already exists
    pub fn deposit_with_commitment(
        env: Env,
        from: Address,
        token: Address,
        amount: i128,
        commitment: BytesN<32>,
        timeout_secs: u64,
        arbiter: Option<Address>,
    ) -> Result<(), RustAcademyError> {
        admin::guard_deposit(&env, PauseFlag::DepositWithCommitment)?;
        escrow::deposit_with_commitment(
            &env,
            from,
            token,
            amount,
            commitment,
            timeout_secs,
            arbiter,
        )
    }
    /// Activate emergency mode (irreversible). Only admin can call. Emits event.
    pub fn activate_emergency_mode(env: Env, caller: Address) -> Result<(), RustAcademyError> {
        admin::require_admin(&env, &caller)?;
        if storage::is_emergency_mode(&env) {
            return Ok(()); // Already set
        }
        storage::set_emergency_mode(&env);
        events::publish_emergency_mode_activated(&env, caller);
        Ok(())
    }

    /// Deposit funds with a target amount higher than the initial payment.
    ///
    /// Transfers `initial_payment` from `owner` to the contract and stores an escrow
    /// with `amount_due` set to the target amount. This enables multi-payment escrows
    /// where the full amount can be paid over time via `partial_payment`.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `token` - Token contract address
    /// * `amount_due` - Target amount to be paid
    /// * `initial_payment` - Initial payment amount
    /// * `owner` - Owner of the funds (must authorize)
    /// * `salt` - Random salt (0–1024 bytes) for uniqueness
    /// * `timeout_secs` - Seconds from now until the escrow expires (0 = no expiry)
    /// * `arbiter` - Optional arbiter address who can resolve disputes
    ///
    /// # Errors
    /// * `InvalidAmount` - initial_payment ≤ 0 or amount_due ≤ 0
    /// * `InvalidSalt` - Salt length exceeds 1024 bytes
    /// * `ContractPaused` - Contract is currently paused
    #[allow(clippy::too_many_arguments)]
    pub fn deposit_partial(
        env: Env,
        token: Address,
        amount_due: i128,
        initial_payment: i128,
        owner: Address,
        salt: Bytes,
        timeout_secs: u64,
        arbiter: Option<Address>,
    ) -> Result<BytesN<32>, RustAcademyError> {
        admin::guard_deposit(&env, PauseFlag::Deposit)?;
        escrow::deposit_partial(
            &env,
            token,
            amount_due,
            initial_payment,
            owner,
            salt,
            timeout_secs,
            arbiter,
        )
    }

    /// Create a multi-signature (M-of-N) arbitration escrow.
    ///
    /// Like `deposit`, but accepts a list of arbiters and a threshold: `threshold`
    /// of the `arbiters` must vote to resolve any dispute.
    ///
    /// # Arguments
    /// * `token` - Token contract address
    /// * `amount` - Amount to escrow (must be > 0)
    /// * `owner` - Depositor address (must authorize)
    /// * `salt` - Uniqueness salt (max 1024 bytes)
    /// * `timeout_secs` - Seconds until expiry; 0 = no expiry
    /// * `arbiters` - Non-empty list of arbiter addresses (max 10, no duplicates)
    /// * `threshold` - Number of arbiter votes required to resolve (1 ≤ threshold ≤ len(arbiters))
    ///
    /// # Errors
    /// * `InvalidAmount` - Amount is zero or negative
    /// * `InvalidSalt` - Salt exceeds 1024 bytes
    /// * `InvalidThreshold` - Threshold is 0, exceeds arbiter count, or arbiters is empty
    /// * `DuplicateArbiter` - The arbiters list contains duplicate addresses
    /// * `TooManyArbiters` - More than 10 arbiters provided
    /// * `CommitmentAlreadyExists` - An escrow with the same commitment already exists
    #[allow(clippy::too_many_arguments)]
    pub fn deposit_with_arbiters(
        env: Env,
        token: Address,
        amount: i128,
        owner: Address,
        salt: Bytes,
        timeout_secs: u64,
        arbiters: Vec<Address>,
        threshold: u32,
    ) -> Result<BytesN<32>, RustAcademyError> {
        admin::guard_deposit(&env, PauseFlag::Deposit)?;
        escrow::deposit_with_arbiters(&env, token, amount, owner, salt, timeout_secs, arbiters, threshold)
    }

    /// Make a partial payment towards an existing escrow.
    ///
    /// Transfers `payment_amount` from `payer` to the contract and increments the
    /// escrow's `amount_paid` field. Rejects overpayment. Emits a `PartialPayment` event.
    /// If the payment completes the escrow, emits an `EscrowFinalized` event.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `commitment` - 32-byte commitment hash identifying the escrow
    /// * `payer` - Address making the payment (must authorize)
    /// * `payment_amount` - Amount to pay; must be positive and not exceed remaining balance
    ///
    /// # Errors
    /// * `InvalidAmount` - Payment amount is zero or negative
    /// * `ContractPaused` - Contract is currently paused
    /// * `CommitmentNotFound` - No escrow exists for the commitment
    /// * `AlreadySpent` - Escrow is already in a terminal state
    /// * `Overpayment` - Payment amount exceeds the remaining amount due
    pub fn partial_payment(
        env: Env,
        commitment: BytesN<32>,
        payer: Address,
        payment_amount: i128,
    ) -> Result<(), RustAcademyError> {
        admin::guard_deposit(&env, PauseFlag::Deposit)?;
        escrow::partial_payment(&env, commitment, payer, payment_amount)
    }

    /// Refund an expired escrow back to its original owner.
    ///
    /// Can only be called after `expires_at` is reached. The caller must be the
    /// original depositor. The escrow must still be `Pending`.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `commitment` - 32-byte commitment hash identifying the escrow
    /// * `caller` - Must equal the original depositor (must authorize)
    ///
    /// # Errors
    /// * `CommitmentNotFound` - No escrow exists for the commitment
    /// * `AlreadySpent` - Escrow is already in a terminal state
    /// * `EscrowNotExpired` - Escrow has no expiry or has not yet expired
    /// * `InvalidOwner` - Caller is not the original owner
    pub fn refund(
        env: Env,
        commitment: BytesN<32>,
        caller: Address,
    ) -> Result<(), RustAcademyError> {
        admin::guard_refund(&env, PauseFlag::Refund)?;
        escrow::refund(&env, commitment, caller)
    }

    /// Cleanup terminal escrow entries to reclaim storage deposits.
    ///
    /// Only escrows in `Spent` or `Refunded` status can be removed.
    pub fn cleanup_escrow(env: Env, commitment: BytesN<32>) -> Result<(), RustAcademyError> {
        admin::guard_initialized(&env)?;
        escrow::cleanup_escrow(&env, commitment)
    }

    /// Cleanup a terminal stealth escrow entry to reclaim storage.
    ///
    /// Only stealth escrows in `Spent` or `Refunded` status can be removed.
    pub fn cleanup_stealth_escrow(
        env: Env,
        stealth_address: BytesN<32>,
    ) -> Result<(), RustAcademyError> {
        admin::require_initialized(&env)?;
        stealth::cleanup_stealth_escrow(&env, stealth_address)
    }

    /// Extend the storage TTL of an escrow record.
    ///
    /// Any user can call this to keep an escrow from being archived.
    pub fn extend_escrow_ttl(env: Env, commitment: BytesN<32>) -> Result<(), RustAcademyError> {
        admin::guard_initialized(&env)?;
        escrow::extend_escrow_ttl(&env, commitment)
    }

    /// Initiate a dispute for a pending escrow, locking the funds.
    ///
    /// Any participant can call this function to start a dispute. The escrow must
    /// have an assigned arbiter and be in `Pending` status. Changes status to `Disputed`.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `commitment` - 32-byte commitment hash identifying the escrow
    ///
    /// # Errors
    /// * `CommitmentNotFound` - No escrow exists for the commitment
    /// * `NoArbiter` - No arbiter assigned to the escrow
    /// * `InvalidDisputeState` - Escrow is not in `Pending` status
    pub fn dispute(env: Env, commitment: BytesN<32>) -> Result<(), RustAcademyError> {
        admin::guard_dispute(&env)?;
        escrow::dispute(&env, commitment)
    }

    /// Resolve a disputed escrow by determining the recipient of funds.
    ///
    /// Only callable by the assigned arbiter. The arbiter decides whether funds
    /// go to the original owner (refund) or to a specified recipient (spend).
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `commitment` - 32-byte commitment hash identifying the escrow
    /// * `resolve_for_owner` - If true, funds go to owner; if false, funds go to recipient
    /// * `recipient` - Address to receive funds when resolve_for_owner is false
    ///
    /// # Errors
    /// * `CommitmentNotFound` - No escrow exists for the commitment
    /// * `NotArbiter` - Caller is not the assigned arbiter
    /// * `NoArbiter` - No arbiter assigned to the escrow
    /// * `InvalidDisputeState` - Escrow is not in `Disputed` status
    pub fn resolve_dispute(
        env: Env,
        caller: Address,
        commitment: BytesN<32>,
        resolve_for_owner: bool,
        recipient: Address,
    ) -> Result<(), RustAcademyError> {
        admin::guard_dispute(&env)?;
        escrow::resolve_dispute(&env, caller, commitment, resolve_for_owner, recipient)
    }

    /// Cast a vote on a disputed escrow (multi-sig mode).
    ///
    /// Only callable by one of the assigned arbiters. Each arbiter can vote once.
    /// When the threshold is reached, anyone can call `resolve_dispute_multi_sig`.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `caller` - The arbiter casting the vote (must authorize)
    /// * `commitment` - 32-byte commitment hash identifying the escrow
    /// * `resolve_for_owner` - If true, voting to refund to owner; if false, voting to pay recipient
    ///
    /// # Errors
    /// * `CommitmentNotFound` - No escrow exists for the commitment
    /// * `InvalidDisputeState` - Escrow is not in `Disputed` status
    /// * `NotAnArbiter` - Caller is not one of the assigned arbiters
    /// * `ArbiterAlreadyVoted` - Caller has already voted on this dispute
    pub fn vote_for_dispute(
        env: Env,
        caller: Address,
        commitment: BytesN<32>,
        resolve_for_owner: bool,
    ) -> Result<(), RustAcademyError> {
        admin::guard_dispute(&env)?;
        escrow::vote_for_dispute(&env, caller, commitment, resolve_for_owner)
    }

    /// Resolve a disputed escrow using multi-sig arbitration.
    ///
    /// Can be called by anyone once the threshold is met. The outcome is determined
    /// by majority vote among the votes cast.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `commitment` - 32-byte commitment hash identifying the escrow
    /// * `recipient` - Address to receive funds when resolving for recipient
    ///
    /// # Errors
    /// * `CommitmentNotFound` - No escrow exists for the commitment
    /// * `InvalidDisputeState` - Escrow is not in `Disputed` status
    /// * `InsufficientVotes` - Threshold has not been reached yet
    pub fn resolve_dispute_multi_sig(
        env: Env,
        commitment: BytesN<32>,
        recipient: Address,
    ) -> Result<(), RustAcademyError> {
        admin::guard_dispute(&env)?;
        escrow::resolve_dispute_multi_sig(&env, commitment, recipient)
    }

    // -----------------------------------------------------------------------
    // Dispute timeout / auto-resolution (Issue #49)
    // -----------------------------------------------------------------------

    /// Set the global dispute resolution timeout in seconds.
    ///
    /// Requires Admin or Operator role. Emits `DisputeTimeoutConfigSet`.
    pub fn set_dispute_timeout(
        env: Env,
        caller: Address,
        timeout_secs: u64,
    ) -> Result<(), RustAcademyError> {
        hook::assert_not_reentrant(&env)?;
        dispute::set_timeout(&env, caller, timeout_secs)
    }

    /// Get the current global dispute resolution timeout in seconds.
    pub fn get_dispute_timeout(env: Env) -> u64 {
        storage::get_dispute_timeout(&env)
    }

    /// Set the global default action for expired disputes.
    ///
    /// Requires Admin or Operator role. Emits `DisputeExpiryActionSet`.
    pub fn set_dispute_expiry_action(
        env: Env,
        caller: Address,
        action: DisputeExpiryAction,
    ) -> Result<(), RustAcademyError> {
        hook::assert_not_reentrant(&env)?;
        dispute::set_expiry_action(&env, caller, action)
    }

    /// Get the current global default action for expired disputes.
    pub fn get_dispute_expiry_action(env: Env) -> DisputeExpiryAction {
        storage::get_dispute_expiry_action(&env)
    }

    /// Get the dispute expiry metadata for an escrow, if any.
    pub fn get_dispute_expiry(
        env: Env,
        commitment: BytesN<32>,
    ) -> Option<crate::types::DisputeExpiry> {
        let commitment_bytes: Bytes = commitment.into();
        storage::get_dispute_expiry(&env, &commitment_bytes)
    }

    /// Resolve a disputed escrow that has passed its resolution timeout.
    ///
    /// Can be called by anyone once the timeout has elapsed. The outcome is
    /// deterministic and based on the snapshotted expiry action.
    pub fn resolve_expired_dispute(
        env: Env,
        commitment: BytesN<32>,
    ) -> Result<(), RustAcademyError> {
        hook::assert_not_reentrant(&env)?;
        dispute::resolve_expired_dispute(&env, commitment)
    }

    /// Initialize the contract with an admin address (one-time only).
    ///
    /// Sets the admin who can pause/unpause, transfer admin, and upgrade the contract.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `admin` - The admin address to set
    ///
    /// # Errors
    /// * `AlreadyInitialized` - Contract has already been initialized
    pub fn initialize(env: Env, admin: Address) -> Result<(), RustAcademyError> {
        admin::initialize(&env, admin)
    }

    /// Get the stored contract schema version.
    ///
    /// Returns `0` for legacy deployments created before version tracking existed.
    pub fn get_version(env: Env) -> u32 {
        admin::get_version(&env)
    }

    /// Return deployment metadata for compatibility validation.
    ///
    /// Clients and indexers can call this view (no auth required) to detect
    /// version mismatches before interacting with the contract.
    ///
    /// The returned [`DeploymentMetadata`] includes:
    /// - `contract_version` — stored schema version (0 for legacy deployments).
    /// - `event_schema_version` — current event payload schema version.
    /// - `wasm_hash` — 32-byte hash of the WASM recorded at the last `upgrade()` call;
    ///   `None` when the contract has never been upgraded.
    /// - `contract_id` — on-chain address of this contract instance, which binds
    ///   the metadata to a specific deployment and network.
    pub fn get_deployment_metadata(env: Env) -> DeploymentMetadata {
        metadata::deployment_metadata(&env)
    }

    /// Return a non-mutating health summary of the contract.
    ///
    /// The status is derived from pause, emergency, and upgrade flags.  It is
    /// ordered from most to least severe: emergency > upgrading > paused > healthy.
    pub fn get_contract_health(env: Env) -> ContractHealth {
        metadata::contract_health(&env)
    }

    /// Return the feature flags supported by this contract build.
    ///
    /// Tooling can use these flags to detect whether optional flows (e.g. upgrade
    /// gating, stealth escrows) are available before sending writes.
    pub fn get_feature_flags(_env: Env) -> FeatureFlags {
        metadata::feature_flags()
    }

    /// Return the state of the upgrade gating mechanism.
    pub fn get_upgrade_state(env: Env) -> UpgradeState {
        metadata::upgrade_state(&env)
    }

    /// Return the supported version ranges for this contract build.
    pub fn get_supported_versions(env: Env) -> SupportedVersions {
        metadata::supported_versions(&env)
    }

    /// Check whether a caller-supplied version pair is compatible with this deployment.
    ///
    /// The contract version is compatible when it equals the current stored version
    /// (migrations are required to move between contract versions).  The event
    /// schema version is compatible when it is one of the versions emitted by this
    /// build.
    pub fn check_schema_compatibility(
        env: Env,
        requested_contract_version: u32,
        requested_event_schema_version: u32,
    ) -> SchemaCompatibility {
        metadata::check_schema_compatibility(
            &env,
            requested_contract_version,
            requested_event_schema_version,
        )
    }

    /// Validate all static event schema definitions against canonical rules (Issue #312).
    ///
    /// Returns `Ok(true)` if all schemas in `EVENT_SCHEMAS` satisfy canonical
    /// uniqueness, topic prefix, sorted payload keys, mandatory replay fields, and
    /// versioning constraints.
    pub fn validate_event_schemas(_env: Env) -> Result<bool, RustAcademyError> {
        events::validate_event_schemas().map_err(|_| RustAcademyError::InternalError)?;
        Ok(true)
    }

    /// Return the current granular pause bitmask.
    ///
    /// See [`crate::storage::PauseFlag`] for the bit definitions.  A value of `0`
    /// means no features are paused.
    pub fn get_pause_flags(env: Env) -> u64 {
        metadata::pause_flags(&env)
    }

    /// Return the supported escrow operation limits and published budget envelopes.
    pub fn get_escrow_operation_limits(_env: Env) -> EscrowOperationLimits {
        escrow::operation_limits()
    }

    /// Estimate the bounded resource envelope for a deposit-shaped payload.
    pub fn estimate_deposit_resources(
        _env: Env,
        salt_bytes: u32,
        arbiter_count: u32,
    ) -> Result<EscrowOperationEstimate, RustAcademyError> {
        escrow::estimate_deposit_resources_view(salt_bytes, arbiter_count)
    }

    /// Estimate the bounded resource envelope for a withdraw-shaped payload.
    pub fn estimate_withdraw_resources(
        env: Env,
        token: Address,
        salt_bytes: u32,
    ) -> Result<EscrowOperationEstimate, RustAcademyError> {
        escrow::estimate_withdraw_resources_view(&env, token, salt_bytes)
    }

    /// Run any pending data migrations for the current contract code (**Admin only**).
    ///
    /// This entrypoint is intended to be called immediately after upgrading the contract WASM
    /// whenever the new release introduces storage or schema changes.
    pub fn migrate(env: Env, caller: Address) -> Result<u32, RustAcademyError> {
        admin::migrate(&env, &caller)
    }

    /// Pause or unpause the contract (**Admin only**).
    ///
    /// When paused, certain operations may be blocked. Caller must equal the stored admin.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `caller` - Caller address (must equal admin)
    /// * `new_state` - `true` to pause, `false` to unpause
    ///
    /// # Errors
    /// * `Unauthorized` - Caller is not the admin, or admin not set
    pub fn set_paused(env: Env, caller: Address, new_state: bool) -> Result<(), RustAcademyError> {
        admin::guard_admin_config(&env)?;
        admin::set_paused(&env, caller, new_state)
    }

    /// Check if the function is currently paused.
    ///
    /// Returns `true` if paused, `false` otherwise.
    pub fn is_feature_paused(env: &Env, flag: PauseFlag) -> bool {
        storage::is_feature_paused(env, flag)
    }

    /// Pause a function in the contract (**Admin only**).
    ///
    /// When paused, the particular operations is blocked. Caller must equal the stored admin.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `caller` - Caller address (must equal admin)
    /// * `mask` - PauseFlag Enum
    ///
    /// # Errors
    /// * `Unauthorized` - Caller is not the admin, or admin not set
    pub fn pause_features(env: Env, caller: Address, mask: u64) -> Result<(), RustAcademyError> {
        admin::guard_admin_config(&env)?;
        admin::set_pause_flags(&env, &caller, mask, 0)
    }

    /// UnPause a function in the contract (**Admin only**).
    ///
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `caller` - Caller address (must equal admin)
    /// * `mask` - PauseFlag Enum
    ///
    /// # Errors
    /// * `Unauthorized` - Caller is not the admin, or admin not set
    pub fn unpause_features(env: Env, caller: Address, mask: u64) -> Result<(), RustAcademyError> {
        admin::guard_admin_config(&env)?;
        admin::set_pause_flags(&env, &caller, 0, mask)
    }

    /// Transfer admin rights to a new address (**Admin only**).
    ///
    /// Caller must equal the current admin. The new admin can later transfer again.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `caller` - Caller address (must equal current admin)
    /// * `new_admin` - New admin address
    ///
    /// # Errors
    /// * `Unauthorized` - Caller is not the admin, or admin not set
    pub fn set_admin(
        env: Env,
        caller: Address,
        new_admin: Address,
    ) -> Result<(), RustAcademyError> {
        admin::guard_admin_config(&env)?;
        admin::set_admin(&env, caller, new_admin)
    }

    /// Propose a new primary admin address (**Admin only**).
    pub fn propose_admin_transfer(
        env: Env,
        caller: Address,
        new_admin: Address,
    ) -> Result<(), RustAcademyError> {
        admin::propose_admin_transfer(&env, caller, new_admin)
    }

    /// Accept a pending admin transfer (**pending admin only**).
    pub fn accept_admin_transfer(env: Env, caller: Address) -> Result<(), RustAcademyError> {
        admin::accept_admin_transfer(&env, caller)
    }

    /// Cancel a pending admin transfer (**Admin only**).
    pub fn cancel_admin_transfer(env: Env, caller: Address) -> Result<(), RustAcademyError> {
        admin::cancel_admin_transfer(&env, caller)
    }

    /// Check if the contract is currently paused.
    ///
    /// Returns `true` if paused, `false` otherwise.
    pub fn is_paused(env: Env) -> bool {
        admin::is_paused(&env)
    }

    /// Get the current admin address.
    ///
    /// Returns `None` if the contract has not been initialized.
    pub fn get_admin(env: Env) -> Option<Address> {
        admin::get_admin(&env)
    }

    /// Get the current fee configuration (read-only).
    pub fn get_fee_config(env: Env) -> FeeConfig {
        storage::get_fee_config(&env)
    }

    /// Register an external hook contract to receive escrow lifecycle callbacks.
    pub fn register_hook(env: Env, hook_contract: Address) -> Result<(), RustAcademyError> {
        admin::guard_initialized(&env)?;
        hook::register_hook(&env, hook_contract)
    }

    /// Unregister a hook contract.
    pub fn unregister_hook(env: Env, hook_contract: Address) -> Result<(), RustAcademyError> {
        admin::guard_initialized(&env)?;
        hook::unregister_hook(&env, hook_contract)
    }

    /// Get the list of registered hook contracts.
    pub fn get_registered_hooks(env: Env) -> Vec<Address> {
        hook::get_registered_hooks(&env)
    }

    /// Set the global fee configuration (**Admin or Operator only**).
    ///
    /// This is the fallback fee applied to all tokens that don't have a per-asset override.
    /// The fee is expressed in basis points (1 = 0.01%, 100 = 1%, 10000 = 100%).
    ///
    /// # Priority Order
    /// Fees are resolved in this order:
    /// 1. Per-asset override (via [`set_per_asset_fee`]) if configured for the token
    /// 2. Oracle dynamic pricing (if configured and price is fresh)
    /// 3. Global static config (this method)
    ///
    /// # Examples
    /// ```ignore
    /// client.set_fee_config(&admin, &FeeConfig {
    ///     fee_bps: 200,  // 2%
    ///     schema_version: FEE_CONFIG_SCHEMA_VERSION,
    /// })?;
    /// ```
    pub fn set_fee_config(
        env: Env,
        caller: Address,
        config: FeeConfig,
    ) -> Result<(), RustAcademyError> {
        admin::guard_admin_config(&env)?;
        admin::set_fee_config(&env, &caller, config)
    }

    /// Set per-asset fee configuration for a specific token (**Admin or Operator only**).
    ///
    /// Per-asset overrides take precedence over global fees and oracle pricing for the
    /// specified token only. This allows fine-grained control (e.g., lower fees for stablecoins,
    /// higher for volatile assets, or zero fees for specific tokens).
    ///
    /// A `fee_bps` of 0 explicitly disables fees for that token, even if global config is non-zero.
    ///
    /// # Fee Distribution
    ///
    /// When a per-asset config is set, fees can be split into three portions:
    /// - **Arbiter portion**: `arbiter_bps` or `arbiter_fee` (when arbiter is present in payout)
    /// - **Platform portion**: `platform_fee` (to platform wallet)
    /// - **Collector portion**: `collector_fee` (to active fee collector)
    ///
    /// **Legacy arbiter_bps** (simpler):
    /// - `arbiter_bps` = percentage of total fee for arbiter (0-10000)
    /// - Remainder goes to collector
    ///
    /// **Explicit ratios** (more flexible):
    /// - `arbiter_fee`, `platform_fee`, `collector_fee` = FeeRatio with numerator/denominator
    /// - When any explicit ratio is set, the legacy `arbiter_bps` is ignored
    /// - Ratios must sum to ≤ 1.0 or the function returns `FeeSplitExceedsTotal`
    ///
    /// # Examples
    ///
    /// Simple per-asset override (2% fee for XLM):
    /// ```ignore
    /// client.set_per_asset_fee(&admin, &xlm_token, &PerAssetFeeConfig {
    ///     fee_bps: 200,
    ///     arbiter_bps: 0,
    ///     ..Default::default()
    /// })?;
    /// ```
    ///
    /// With arbiter split (1% fee, 25% to arbiter):
    /// ```ignore
    /// client.set_per_asset_fee(&admin, &token, &PerAssetFeeConfig {
    ///     fee_bps: 100,
    ///     arbiter_bps: 2500,  // 25% of fee
    ///     ..Default::default()
    /// })?;
    /// ```
    ///
    /// With explicit splits (0.5% fee: 40% arbiter, 30% platform, 30% collector):
    /// ```ignore
    /// client.set_per_asset_fee(&admin, &token, &PerAssetFeeConfig {
    ///     fee_bps: 50,
    ///     arbiter_bps: 0,  // Ignored when explicit ratios are set
    ///     arbiter_fee: FeeRatio { numerator: 2, denominator: 5 },
    ///     platform_fee: FeeRatio { numerator: 3, denominator: 10 },
    ///     collector_fee: FeeRatio { numerator: 3, denominator: 10 },
    ///     schema_version: PER_ASSET_FEE_SCHEMA_VERSION,
    /// })?;
    /// ```
    pub fn set_per_asset_fee(
        env: Env,
        caller: Address,
        token: Address,
        config: PerAssetFeeConfig,
    ) -> Result<(), RustAcademyError> {
        admin::guard_admin_config(&env)?;
        admin::set_per_asset_fee(&env, &caller, token, config)
    }

    /// Get per-asset fee configuration for a token (read-only).
    ///
    /// Returns `Some(config)` if a per-asset override has been set for this token,
    /// or `None` if this token uses the global fee config or oracle pricing.
    ///
    /// # Examples
    /// ```ignore
    /// if let Some(per_asset_config) = client.get_per_asset_fee(&token) {
    ///     println!("XLM fee: {}%", per_asset_config.fee_bps / 100);
    /// } else {
    ///     println!("XLM uses global fee or oracle pricing");
    /// }
    /// ```
    pub fn get_per_asset_fee(env: Env, token: Address) -> Option<PerAssetFeeConfig> {
        storage::get_per_asset_fee(&env, &token)
    }

    /// Set oracle fee configuration (**Admin or Operator only**).
    pub fn set_oracle_fee_config(
        env: Env,
        caller: Address,
        config: OracleFeeConfig,
    ) -> Result<(), RustAcademyError> {
        admin::guard_admin_config(&env)?;
        admin::set_oracle_fee_config(&env, &caller, config)
    }

    /// Get the current oracle fee configuration.
    pub fn get_oracle_fee_config(env: Env) -> Option<OracleFeeConfig> {
        oracle::get_oracle_fee_config(&env)
    }

    /// Get the platform wallet address (read-only).
    pub fn get_platform_wallet(env: Env) -> Option<Address> {
        storage::get_platform_wallet(&env)
    }

    /// Set the platform wallet address (**Admin only**).
    pub fn set_platform_wallet(
        env: Env,
        caller: Address,
        wallet: Address,
    ) -> Result<(), RustAcademyError> {
        admin::guard_admin_config(&env)?;
        admin::set_platform_wallet(&env, &caller, wallet)
    }

    /// Rotate active fee collector (**Admin only**).
    pub fn rotate_fee_collector(
        env: Env,
        caller: Address,
        new_collector: Address,
    ) -> Result<u32, RustAcademyError> {
        admin::guard_admin_config(&env)?;
        admin::rotate_fee_collector(&env, &caller, new_collector)
    }

    /// Read current active fee collector (rotation-aware).
    pub fn get_active_fee_collector(env: Env) -> Option<Address> {
        fee_router::active_collector(&env)
    }

    /// Get the status of an escrow by its commitment hash (read-only).
    ///
    /// Returns `Pending`, `Spent`, `Expired`, or `Refunded` if an escrow exists; `None` otherwise.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `commitment` - 32-byte commitment hash used as the escrow key
    pub fn get_commitment_state(env: Env, commitment: BytesN<32>) -> Option<EscrowStatus> {
        let commitment_bytes: Bytes = commitment.into();
        let entry: Option<EscrowEntry> = get_escrow(&env, &commitment_bytes);
        entry.map(|e| e.status)
    }

    /// Verify withdrawal parameters without submitting a transaction (read-only).
    ///
    /// Recomputes the commitment from `amount`, `salt`, and `owner`, then checks that an
    /// escrow exists with status `Pending`, matching amount, and not yet expired.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `amount` - Amount to verify (non-negative)
    /// * `salt` - Salt used when creating the deposit
    /// * `owner` - Owner of the escrow
    pub fn verify_proof_view(env: Env, amount: i128, salt: Bytes, owner: Address) -> bool {
        let commitment_result = commitment::amount_commitment_hashes(&env, &owner, amount, &salt);

        let (commitment, legacy_commitment) = match commitment_result {
            Ok(c) => c,
            Err(_) => return false,
        };

        let commitment_bytes: Bytes = commitment.into();
        let entry: Option<EscrowEntry> = get_escrow(&env, &commitment_bytes).or_else(|| {
            let legacy_commitment_bytes: Bytes = legacy_commitment.into();
            get_escrow(&env, &legacy_commitment_bytes)
        });

        match entry {
            Some(e) => {
                if e.status != EscrowStatus::Pending {
                    return false;
                }
                if e.expires_at > 0 && env.ledger().timestamp() >= e.expires_at {
                    return false;
                }
                e.amount_due == amount
            }
            None => false,
        }
    }

    /// Get a privacy-aware view of escrow details for a commitment hash (read-only).
    ///
    /// Returns a [`PrivacyAwareEscrowView`] if an escrow exists for the commitment,
    /// or `None` otherwise.
    ///
    /// ## Privacy behaviour
    /// - If the escrow owner **has privacy enabled** and `caller` is **not** the owner,
    ///   the `amount`, `owner`, and `arbiter` fields are returned as `None`.
    /// - If privacy is **disabled**, or `caller` equals the escrow owner,
    ///   all fields are returned in full.
    /// - If `caller` equals the arbiter, the arbiter field is always visible.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `commitment` - 32-byte commitment hash identifying the escrow
    /// * `caller` - Address of the caller; used to determine whether full details
    ///   are returned when privacy is enabled
    pub fn get_escrow_details(
        env: Env,
        commitment: BytesN<32>,
        caller: Address,
    ) -> Option<PrivacyAwareEscrowView> {
        let commitment_bytes: Bytes = commitment.into();
        let entry = get_escrow(&env, &commitment_bytes)?;

        let privacy_on = privacy::get_privacy(&env, entry.owner.clone());
        let is_owner = caller == entry.owner;
        let is_arbiter = entry.arbiter.as_ref().is_some_and(|a| caller == *a);
        let show_sensitive = !privacy_on || is_owner || is_arbiter;

        if show_sensitive {
            Some(PrivacyAwareEscrowView {
                token: entry.token,
                amount_due: Some(entry.amount_due),
                amount_paid: Some(entry.amount_paid),
                owner: Some(entry.owner),
                status: entry.status,
                created_at: entry.created_at,
                expires_at: entry.expires_at,
                arbiter: entry.arbiter,
            })
        } else {
            Some(PrivacyAwareEscrowView {
                token: entry.token,
                amount_due: None,
                amount_paid: None,
                owner: None,
                status: entry.status,
                created_at: entry.created_at,
                expires_at: entry.expires_at,
                arbiter: None,
            })
        }
    }

    // -----------------------------------------------------------------------
    // Stealth Address – Privacy v2 (Issue #157)
    // -----------------------------------------------------------------------

    /// Register an ephemeral public key and lock funds for a stealth recipient.
    ///
    /// The sender computes a one-time `stealth_address` off-chain via:
    /// ```text
    /// shared_secret   = SHA-256(eph_pub || spend_pub)
    /// stealth_address = SHA-256(spend_pub || shared_secret)
    /// ```
    /// The contract re-derives and verifies the stealth address on-chain, then
    /// locks `amount` of `token` under it.  The recipient's main address is
    /// never recorded on-chain.
    ///
    /// All deposit parameters are bundled in [`StealthDepositParams`] to keep
    /// the argument count within clippy's limit.
    ///
    /// # Errors
    /// * `InvalidAmount`            – amount ≤ 0.
    /// * `ContractPaused`           – contract is paused.
    /// * `StealthAddressMismatch`   – on-chain re-derivation does not match.
    /// * `StealthAddressAlreadyUsed`– stealth address already has a deposit.
    pub fn register_ephemeral_key(
        env: Env,
        params: StealthDepositParams,
    ) -> Result<BytesN<32>, RustAcademyError> {
        admin::guard_stealth(&env, PauseFlag::Deposit)?;
        stealth::register_ephemeral_key(&env, params)
    }

    /// Withdraw funds locked under a stealth address.
    ///
    /// The caller proves ownership by supplying the matching `spend_pub` and
    /// `eph_pub`.  The contract re-derives the stealth address; if it matches,
    /// funds are transferred to `recipient`.
    ///
    /// The `recipient` address is only revealed at withdrawal time and is not
    /// linked to any prior on-chain activity.
    ///
    /// # Arguments
    /// * `recipient`       – Address to receive the funds (must authorize).
    /// * `eph_pub`         – Ephemeral public key from the registration event.
    /// * `spend_pub`       – Recipient's spend public key (32 bytes).
    /// * `stealth_address` – The one-time stealth address to withdraw from.
    ///
    /// # Errors
    /// * `StealthEscrowNotFound`  – no escrow for this stealth address.
    /// * `AlreadySpent`           – already withdrawn or refunded.
    /// * `EscrowExpired`          – escrow has passed its expiry.
    /// * `StealthAddressMismatch` – re-derived address does not match.
    /// * `ContractPaused`         – contract is paused.
    pub fn stealth_withdraw(
        env: Env,
        recipient: Address,
        eph_pub: BytesN<32>,
        spend_pub: BytesN<32>,
        stealth_address: BytesN<32>,
    ) -> Result<bool, RustAcademyError> {
        admin::guard_stealth(&env, PauseFlag::Withdrawal)?;
        stealth::stealth_withdraw(&env, recipient, eph_pub, spend_pub, stealth_address)
    }

    /// Get the status of a stealth escrow (read-only).
    ///
    /// Returns `Pending`, `Spent`, or `Refunded` if an escrow exists; `None` otherwise.
    /// Does not reveal amount, token, or any key material.
    ///
    /// # Arguments
    /// * `stealth_address` – The 32-byte one-time stealth address.
    pub fn get_stealth_status(env: Env, stealth_address: BytesN<32>) -> Option<EscrowStatus> {
        stealth::get_stealth_status(&env, &stealth_address)
    }

    /// Upgrade the contract to a new WASM implementation (**Admin only**).
    ///
    /// Caller must have the [`Role::Admin`] role and authorize.
    /// The new WASM must be pre-uploaded to the network.
    /// Emits an upgrade event for audit.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `caller` - Caller address (must have admin role; must authorize)
    /// * `new_wasm_hash` - 32-byte hash of the new WASM code
    ///
    /// # Errors
    /// * `Unauthorized` - Caller is not the admin, or admin not set
    /// * `UpgradeNotInProgress` - no upgrade is currently in progress
    /// * `UpgradeWindowNotActive` - upgrade window is not currently active
    ///
    /// # Security
    /// Updates the contract's executable code. Call [`migrate`]( RustAcademyContract::migrate)
    /// afterwards if the new release requires storage migration.
    pub fn upgrade(
        env: Env,
        caller: Address,
        new_wasm_hash: BytesN<32>,
    ) -> Result<(), RustAcademyError> {
        admin::upgrade(&env, &caller, new_wasm_hash)
    }

    /// Set the upgrade window: when upgrades are permitted (**Admin only**).
    ///
    /// Defines an epoch timestamp range `[start, end)` during which `start_upgrade` is allowed.
    /// - `start` = 0: no window set, upgrades blocked
    /// - `end` = 0: no upper bound, upgrades allowed from `start` onwards
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `caller` - Caller address (must be admin)
    /// * `start` - Ledger timestamp when upgrades become allowed
    /// * `end` - Ledger timestamp when upgrades become blocked (0 = unbounded)
    ///
    /// # Errors
    /// * `InsufficientRole` - Caller is not admin
    pub fn set_upgrade_window(
        env: Env,
        caller: Address,
        start: u64,
        end: u64,
    ) -> Result<(), RustAcademyError> {
        admin::set_upgrade_window(&env, &caller, start, end)
    }

    /// Get the current upgrade window.
    ///
    /// Returns `(start, end)` epoch timestamps. Both 0 means no window is set.
    pub fn get_upgrade_window(env: Env) -> (u64, u64) {
        storage::get_upgrade_window(&env)
    }

    /// Enable or disable the upgrade gate master switch (**Admin only**).
    ///
    /// When disabled, `start_upgrade` is blocked regardless of the configured
    /// upgrade window.  Defaults to enabled when never explicitly set.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `caller` - Caller address (must be admin)
    /// * `enabled` - `true` to enable upgrades, `false` to disable
    ///
    /// # Errors
    /// * `InsufficientRole` - Caller is not admin
    pub fn set_upgrade_gate(
        env: Env,
        caller: Address,
        enabled: bool,
    ) -> Result<(), RustAcademyError> {
        admin::require_admin(&env, &caller)?;
        storage::set_upgrade_gate_enabled(&env, enabled);
        Ok(())
    }

    /// Validate whether the current contract state is safe for an upgrade.
    ///
    /// Returns an [`UpgradeSafetyReport`] that breaks down each precondition.
    /// This is a read-only view; no authorization required.
    pub fn check_upgrade_safety(env: Env) -> types::UpgradeSafetyReport {
        storage::check_upgrade_safety(&env)
    }

    /// Return the current upgrade gate status.
    ///
    /// Combines window, in-progress, and gate-enabled flags into a single
    /// [`UpgradeState`] snapshot.  This is a read-only view.
    pub fn get_upgrade_status(env: Env) -> types::UpgradeState {
        metadata::upgrade_state(&env)
    }

    /// Start an upgrade during the active upgrade window (**Admin only**).
    ///
    /// Sets the contract into upgrade-in-progress state and emits `UpgradeStarted` event.
    /// Must be followed by calling `upgrade()` and then `complete_upgrade()`.
    ///
    /// Blocks outside the upgrade window (Issue #432 AC1).
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `caller` - Caller address (must be admin)
    /// * `new_version` - The target contract version
    /// * `new_wasm_hash` - The target WASM hash
    ///
    /// # Errors
    /// * `UpgradeWindowNotActive` - upgrade window is not currently active
    /// * `UpgradeAlreadyInProgress` - an upgrade is already in progress
    pub fn start_upgrade(
        env: Env,
        caller: Address,
        new_version: u32,
        new_wasm_hash: BytesN<32>,
    ) -> Result<(), RustAcademyError> {
        admin::start_upgrade(&env, &caller, new_version, new_wasm_hash)
    }

    /// Cancel a pending upgrade and clear gating state (**Admin only**).
    pub fn cancel_upgrade(env: Env, caller: Address) -> Result<(), RustAcademyError> {
        admin::cancel_upgrade(&env, &caller)
    }

    /// Complete an upgrade after WASM swap (**Admin only**).
    ///
    /// Runs migration logic and validates post-upgrade invariants (Issue #432 AC2).
    /// Emits `UpgradeCompleted` event. Must be called after `start_upgrade()` and `upgrade()`.
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `caller` - Caller address (must be admin)
    /// * `new_version` - The target version (0 = auto-detect from migration)
    ///
    /// # Returns
    /// The actual new contract version
    ///
    /// # Errors
    /// * `UpgradeNotInProgress` - no upgrade is currently in progress
    /// * `InternalError` - post-upgrade invariants violated
    pub fn complete_upgrade(
        env: Env,
        caller: Address,
        new_version: u32,
    ) -> Result<u32, RustAcademyError> {
        admin::complete_upgrade(&env, &caller, new_version)
    }

    // -----------------------------------------------------------------------
    // Role Management (**Admin only**)
    // -----------------------------------------------------------------------

    /// Grant a role to an account.
    pub fn grant_role(
        env: Env,
        caller: Address,
        target: Address,
        role: Role,
    ) -> Result<(), RustAcademyError> {
        admin::grant_role(&env, caller, target, role)
    }

    /// Revoke a role from an account.
    pub fn revoke_role(
        env: Env,
        caller: Address,
        target: Address,
        role: Role,
    ) -> Result<(), RustAcademyError> {
        admin::revoke_role(&env, caller, target, role)
    }

    /// Remove all roles from an account.
    pub fn clear_roles(env: Env, caller: Address, target: Address) -> Result<(), RustAcademyError> {
        admin::clear_roles(&env, caller, target)
    }

    /// Get all roles assigned to an account.
    pub fn get_roles(env: Env, account: Address) -> Vec<Role> {
        storage::get_roles(&env, &account)
    }

    /// Get the pending admin transfer target, if any.
    pub fn get_pending_admin_transfer(env: Env) -> Option<Address> {
        storage::get_pending_admin_transfer(&env)
    }
}
