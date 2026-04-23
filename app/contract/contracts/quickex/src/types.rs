//! Types used in the QuickEx storage layer and contract logic.
//!
//! See [`crate::storage`] for the storage schema and key layout.

use soroban_sdk::{contracttype, Address, Bytes, BytesN};

/// Escrow entry status.
///
/// Tracks the lifecycle of a deposited commitment:
///
/// ```text
/// [*] --> Pending  : deposit()
/// Pending --> Spent    : withdraw(proof)  [current_time < expires_at]
/// Pending --> Refunded : refund(owner)    [current_time >= expires_at]
/// Pending --> Disputed : dispute()        [any participant with arbiter]
/// Disputed --> Spent/Refunded : resolve_dispute() [arbiter decides]
/// ```
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum EscrowStatus {
    Pending,
    Spent,
    /// Kept for backwards-compat with any existing on-chain data; semantically
    /// equivalent to an escrow that has passed expiry but not yet been refunded.
    Expired,
    Refunded,
    /// Funds are locked pending arbiter resolution.
    Disputed,
}

/// Escrow entry structure.
///
/// Stored under [`DataKey::Escrow`](crate::storage::DataKey::Escrow)(commitment) in persistent storage.
#[contracttype]
#[derive(Clone)]
pub struct EscrowEntry {
    /// Token contract address for the escrowed funds.
    pub token: Address,
    /// Amount in token base units.
    pub amount: i128,
    /// Owner who deposited and may refund after expiry.
    pub owner: Address,
    /// Current status (Pending, Spent, Refunded, Expired, Disputed).
    pub status: EscrowStatus,
    /// Ledger timestamp when the escrow was created.
    pub created_at: u64,
    /// Ledger timestamp after which withdrawal is blocked and refund is enabled.
    /// A value of `0` means the escrow never expires (no timeout).
    pub expires_at: u64,
    /// Optional arbiter address for dispute resolution.
    pub arbiter: Option<Address>,
}

/// Privacy-aware view of an escrow entry.
///
/// Returned by [`QuickexContract::get_escrow_details`] instead of the raw
/// [`EscrowEntry`]. Sensitive fields (`amount`, `owner`) are set to `None`
/// when the escrow owner has privacy enabled and the caller is not the owner.
///
/// ## Field visibility
///
/// | Field        | Privacy off | Privacy on + caller is owner | Privacy on + caller is stranger |
/// |--------------|-------------|------------------------------|---------------------------------|
/// | `token`      | ✓           | ✓                            | ✓                               |
/// | `status`     | ✓           | ✓                            | ✓                               |
/// | `created_at` | ✓           | ✓                            | ✓                               |
/// | `expires_at` | ✓           | ✓                            | ✓                               |
/// | `amount`     | ✓           | ✓                            | `None`                          |
/// | `owner`      | ✓           | ✓                            | `None`                          |
#[contracttype]
#[derive(Clone)]
pub struct PrivacyAwareEscrowView {
    /// Token contract address (always visible).
    pub token: Address,
    /// Escrowed amount. `None` when privacy is enabled and caller is not the owner.
    pub amount: Option<i128>,
    /// Owner address. `None` when privacy is enabled and caller is not the owner.
    pub owner: Option<Address>,
    /// Current lifecycle status (always visible).
    pub status: EscrowStatus,
    /// Creation timestamp (always visible).
    pub created_at: u64,
    /// Expiry timestamp; `0` means no expiry (always visible).
    pub expires_at: u64,
    /// Arbiter address for dispute resolution. `None` if not set.
    pub arbiter: Option<Address>,
}

/// Parameters for registering an ephemeral key (stealth deposit).
///
/// Bundles the 8 arguments of `register_ephemeral_key` into a single struct
/// to satisfy the `clippy::too_many_arguments` lint (limit: 7).
#[contracttype]
#[derive(Clone)]
pub struct StealthDepositParams {
    /// Depositor address (must authorize the token transfer).
    pub sender: Address,
    /// Token contract address.
    pub token: Address,
    /// Amount to lock; must be positive.
    pub amount: i128,
    /// Sender's ephemeral public key (32 bytes).
    pub eph_pub: BytesN<32>,
    /// Recipient's spend public key (32 bytes).
    pub spend_pub: BytesN<32>,
    /// Pre-computed one-time stealth address (32 bytes).
    pub stealth_address: BytesN<32>,
    /// Seconds until expiry; 0 = no expiry.
    pub timeout_secs: u64,
}

/// Stealth escrow entry for Privacy v2 (Issue #157).
///
/// Locked under a one-time stealth address derived via Diffie-Hellman.
/// The original recipient's public address is never stored on-chain.
///
/// ## Field visibility
/// - `eph_pub` is public (needed by recipient to scan).
/// - `token`, `amount`, `status`, `created_at`, `expires_at` are public.
/// - The link between `eph_pub` and the recipient's real identity is only
///   computable by the recipient (who holds the matching private key).
#[contracttype]
#[derive(Clone)]
pub struct StealthEscrowEntry {
    /// Token contract address for the escrowed funds.
    pub token: Address,
    /// Amount in token base units.
    pub amount: i128,
    /// Sender's ephemeral public key (32 bytes). Stored so the recipient can
    /// scan events and re-derive the shared secret off-chain.
    pub eph_pub: BytesN<32>,
    /// Current lifecycle status.
    pub status: EscrowStatus,
    /// Ledger timestamp when the stealth escrow was created.
    pub created_at: u64,
    /// Expiry timestamp; `0` means no expiry.
    pub expires_at: u64,
}

/// Fee configuration for the platform.
///
/// Stored under [`DataKey::FeeConfig`](crate::storage::DataKey::FeeConfig) in persistent storage.
#[contracttype]
#[derive(Clone, Copy, Debug)]
pub struct FeeConfig {
    /// Fee in basis points (1 = 0.01%, 100 = 1%, 10000 = 100%).
    pub fee_bps: u32,
}

/// Parameters for a single withdrawal in a batch operation.
///
/// Bundles the per-item arguments for [`QuickexContract::batch_withdraw`].
#[contracttype]
#[derive(Clone)]
pub struct BatchWithdrawParams {
    /// Amount to withdraw; must be positive and match the escrow amount.
    pub amount: i128,
    /// Commitment hash for the escrow being withdrawn.
    pub commitment: BytesN<32>,
    /// Recipient address (must authorize the call).
    pub to: Address,
    /// Salt used when creating the original deposit commitment.
    pub salt: Bytes,
}

/// Parameters for a single refund in a batch operation.
///
/// Bundles the per-item arguments for [`QuickexContract::batch_refund`].
#[contracttype]
#[derive(Clone)]
pub struct BatchRefundParams {
    /// 32-byte commitment hash identifying the escrow to refund.
    pub commitment: BytesN<32>,
    /// Caller address; must equal the original depositor (must authorize).
    pub caller: Address,
}

/// Per-item outcome in a batch operation.
///
/// `Ok(true)` means the item succeeded; `Err(code)` carries the [`QuickexError`]
/// discriminant (u32) so the result is `contracttype`-serialisable.
///
/// Using `u32` for the error code keeps the type `contracttype`-compatible
/// without pulling in the full error enum into the ABI.
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum BatchItemResult {
    /// Item processed successfully.
    Ok,
    /// Item failed; carries the [`crate::errors::QuickexError`] discriminant.
    Err(u32),
}
