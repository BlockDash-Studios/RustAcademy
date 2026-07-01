//! Types used in the  RustAcademy storage layer and contract logic.
//!
//! See [`crate::storage`] for the storage schema and key layout.

use crate::errors::RustAcademyError;
use soroban_sdk::{contracttype, Address, BytesN, Symbol, Vec};

/// Explicit fee ratio used to prescale a payout share.
///
/// A ratio of `0 / 1` disables the share. When `numerator > 0`, `denominator`
/// must also be non-zero and the ratio must not exceed `1.0`.
#[contracttype]
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct FeeRatio {
    pub numerator: u32,
    pub denominator: u32,
}

impl FeeRatio {
    /// Returns `true` when the ratio is configured to pay out a non-zero share.
    pub fn is_active(&self) -> bool {
        self.numerator > 0
    }

    /// Validate that the ratio is usable for fee distribution.
    pub fn validate(&self) -> Result<(), RustAcademyError> {
        if self.numerator == 0 {
            return Ok(());
        }
        if self.denominator == 0 || self.numerator > self.denominator {
            return Err(RustAcademyError::InvalidFeeConfiguration);
        }
        Ok(())
    }
}

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

/// Storage schema version for escrow entries.
///
/// Increment when EscrowEntry fields are added that require migration.
/// A value of 0 indicates legacy records (pre-versioning).
pub const ESCROW_SCHEMA_VERSION: u32 = 1;

/// Escrow entry structure.
///
/// Stored under [`DataKey::Escrow`](crate::storage::DataKey::Escrow)(commitment) in persistent storage.
#[contracttype]
#[derive(Clone)]
pub struct EscrowEntry {
    /// Token contract address for the escrowed funds.
    pub token: Address,
    /// Total amount due in token base units (the target amount to be paid).
    pub amount_due: i128,
    /// Amount already paid towards the escrow.
    pub amount_paid: i128,
    /// Owner who deposited and may refund after expiry.
    pub owner: Address,
    /// Current status (Pending, Spent, Refunded, Expired, Disputed).
    pub status: EscrowStatus,
    /// Ledger timestamp when the escrow was created.
    pub created_at: u64,
    /// Ledger timestamp after which withdrawal is blocked and refund is enabled.
    /// A value of `0` means the escrow never expires (no timeout).
    pub expires_at: u64,
    /// Optional single arbiter address for dispute resolution (legacy).
    pub arbiter: Option<Address>,
    /// Array of arbiter addresses for multi-sig dispute resolution.
    pub arbiters: Vec<Address>,
    /// Threshold: number of arbiter votes required to resolve a dispute (M-of-N).
    /// A value of 0 means single-arbiter mode (uses `arbiter` field).
    /// A value > 0 means multi-sig mode (uses `arbiters` array).
    pub arbiter_threshold: u32,
    /// Storage schema version for this record. Used during migrations to detect
    /// legacy records that need field upgrades.
    pub schema_version: u32,
}

/// Privacy-aware view of an escrow entry.
///
/// Returned by [` RustAcademyContract::get_escrow_details`] instead of the raw
/// [`EscrowEntry`]. Sensitive fields (`amount_due`, `amount_paid`, `owner`) are set to `None`
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
/// | `amount_due` | ✓           | ✓                            | `None`                          |
/// | `amount_paid`| ✓           | ✓                            | `None`                          |
/// | `owner`      | ✓           | ✓                            | `None`                          |
#[contracttype]
#[derive(Clone)]
pub struct PrivacyAwareEscrowView {
    /// Token contract address (always visible).
    pub token: Address,
    /// Total amount due. `None` when privacy is enabled and caller is not the owner.
    pub amount_due: Option<i128>,
    /// Amount already paid. `None` when privacy is enabled and caller is not the owner.
    pub amount_paid: Option<i128>,
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

/// Arbiter vote on a disputed escrow.
///
/// Stored under [`DataKey::DisputeVote`](crate::storage::DataKey::DisputeVote)(commitment, arbiter).
/// Tracks each arbiter's vote for a specific dispute.
#[contracttype]
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct DisputeVote {
    /// The arbiter who cast this vote.
    pub arbiter: Address,
    /// True if voting to refund to owner, false if voting to pay recipient.
    pub resolve_for_owner: bool,
    /// Ledger timestamp when the vote was cast.
    pub voted_at: u64,
}

/// Deterministic outcome for a dispute that has passed its resolution timeout.
///
/// Used by the auto-resolution path to transition stale disputes into a terminal
/// state without requiring an arbiter vote.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum DisputeExpiryAction {
    /// Refund the escrowed funds back to the original owner.
    RefundOwner,
    /// Pay the escrowed funds to the assigned arbiter.
    PayArbiter,
}

impl Default for DisputeExpiryAction {
    fn default() -> Self {
        DisputeExpiryAction::RefundOwner
    }
}

/// Dispute timeout metadata stored per escrow.
///
/// Recorded when a dispute is opened and consulted during auto-resolution.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DisputeExpiry {
    /// Ledger timestamp after which the dispute may be auto-resolved.
    pub expires_at: u64,
    /// Deterministic action to take once the timeout is reached.
    pub action: DisputeExpiryAction,
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
    /// Total amount due; must be positive.
    pub amount_due: i128,
    /// Initial payment amount; must be positive and <= amount_due.
    pub amount_paid: i128,
    /// Sender's ephemeral public key (32 bytes).
    pub eph_pub: BytesN<32>,
    /// Recipient's spend public key (32 bytes).
    pub spend_pub: BytesN<32>,
    /// Pre-computed one-time stealth address (32 bytes).
    pub stealth_address: BytesN<32>,
    /// Seconds until expiry; 0 = no expiry.
    pub timeout_secs: u64,
}

/// Storage schema version for stealth escrow entries.
///
/// Increment when StealthEscrowEntry fields are added that require migration.
pub const STEALTH_ESCROW_SCHEMA_VERSION: u32 = 1;

/// Stealth escrow entry for Privacy v2 (Issue #157).
///
/// Locked under a one-time stealth address derived via Diffie-Hellman.
/// The original recipient's public address is never stored on-chain.
///
/// ## Field visibility
/// - `eph_pub` is public (needed by recipient to scan).
/// - `token`, `amount_due`, `amount_paid`, `status`, `created_at`, `expires_at` are public.
/// - The link between `eph_pub` and the recipient's real identity is only
///   computable by the recipient (who holds the matching private key).
#[contracttype]
#[derive(Clone)]
pub struct StealthEscrowEntry {
    /// Token contract address for the escrowed funds.
    pub token: Address,
    /// Total amount due in token base units (the target amount to be paid).
    pub amount_due: i128,
    /// Amount already paid towards the escrow.
    pub amount_paid: i128,
    /// Sender's ephemeral public key (32 bytes). Stored so the recipient can
    /// scan events and re-derive the shared secret off-chain.
    pub eph_pub: BytesN<32>,
    /// Current lifecycle status.
    pub status: EscrowStatus,
    /// Ledger timestamp when the stealth escrow was created.
    pub created_at: u64,
    /// Expiry timestamp; `0` means no expiry.
    pub expires_at: u64,
    /// Storage schema version for this record. Used during migrations to detect
    /// legacy records that need field upgrades.
    pub schema_version: u32,
}

/// Storage schema version for fee configuration.
///
/// Increment when FeeConfig fields are added that require migration.
pub const FEE_CONFIG_SCHEMA_VERSION: u32 = 1;

/// Fee configuration for the platform.
///
/// Stored under [`DataKey::FeeConfig`](crate::storage::DataKey::FeeConfig) in persistent storage.
#[contracttype]
#[derive(Clone, Copy, Debug)]
pub struct FeeConfig {
    /// Fee in basis points (1 = 0.01%, 100 = 1%, 10000 = 100%).
    pub fee_bps: u32,
    /// Storage schema version for this record. Used during migrations to detect
    /// legacy records that need field upgrades.
    pub schema_version: u32,
}

/// Storage schema version for per-asset fee configuration.
///
/// Increment when PerAssetFeeConfig fields are added that require migration.
pub const PER_ASSET_FEE_SCHEMA_VERSION: u32 = 1;

/// Per-asset fee configuration (Fee Router v2 — Issue #305).
///
/// Stored under [`DataKey::PerAssetFee`](crate::storage::DataKey::PerAssetFee)`(token)` in
/// persistent storage. When present for a token, overrides the global [`FeeConfig`] for
/// that token only. A value of `fee_bps = 0` explicitly disables fees for that token even
/// if the global config is non-zero.
///
/// The explicit `*_fee` ratios are optional and default to zero. When any of
/// them are set, the router uses the prescaled ratios instead of the legacy
/// `arbiter_bps` split for that token.
#[contracttype]
#[derive(Clone, Copy, Debug, Default)]
pub struct PerAssetFeeConfig {
    /// Fee in basis points for this specific token. Overrides the global `FeeConfig`.
    /// Range: 0 (no fee) to 10000 (100%).
    pub fee_bps: u32,
    /// Arbiter's share of the collected fee, expressed in basis points of the fee itself.
    /// 0 = no arbiter split — entire fee goes to the collector.
    /// Example: fee_bps=200 (2%), arbiter_bps=2000 (20%) → arbiter gets 0.4%, collector 1.6%.
    pub arbiter_bps: u32,
    /// Storage schema version for this record. Used during migrations to detect
    /// legacy records that need field upgrades.
    pub schema_version: u32,
}

/// Storage schema version for oracle fee configuration.
///
/// Increment when OracleFeeConfig fields are added that require migration.
pub const ORACLE_FEE_CONFIG_SCHEMA_VERSION: u32 = 1;

/// Oracle fee configuration for dynamic USD-based fee collection.
#[contracttype]
#[derive(Clone, Debug)]
pub struct OracleFeeConfig {
    /// External oracle contract address.
    pub oracle: Address,
    /// Target fee in microdollars (1 USD = 1_000_000 microdollars).
    pub usd_fee_micros: i128,
    /// Maximum age of oracle price data before falling back.
    pub stale_threshold_secs: u64,
    /// Storage schema version for this record. Used during migrations to detect
    /// legacy records that need field upgrades.
    pub schema_version: u32,
}

/// Supported escrow operation bounds and published worst-case budget envelopes.
///
/// These limits are part of the public contract surface so integrators can
/// preflight deposits and withdrawals before submitting transactions.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct EscrowOperationLimits {
    /// Maximum salt bytes accepted for resource-bounded deposit and withdraw flows.
    pub max_salt_bytes: u32,
    /// Maximum token transfer paths supported by a deposit call.
    pub deposit_max_token_count: u32,
    /// Maximum arbiters supported by the deposit family (`deposit_with_arbiters`).
    pub deposit_max_arbiter_count: u32,
    /// Maximum fee recipients touched by deposit paths.
    pub deposit_max_fee_recips: u32,
    /// Published worst-case CPU budget envelope for supported deposit payloads.
    pub deposit_max_cpu_instructions: u64,
    /// Published worst-case memory budget envelope for supported deposit payloads.
    pub deposit_max_memory_bytes: u64,
    /// Maximum token transfer paths supported by a withdraw call.
    pub withdraw_max_token_count: u32,
    /// Maximum arbiters consulted by the standard withdraw path.
    pub withdraw_max_arbiter_count: u32,
    /// Maximum fee recipients touched by a withdraw call.
    pub withdraw_max_fee_recips: u32,
    /// Published worst-case CPU budget envelope for supported withdraw payloads.
    pub withdraw_max_cpu_instructions: u64,
    /// Published worst-case memory budget envelope for supported withdraw payloads.
    pub withdraw_max_memory_bytes: u64,
}

/// Resource estimate for a concrete escrow operation shape.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct EscrowOperationEstimate {
    pub token_count: u32,
    pub arbiter_count: u32,
    pub fee_recipient_count: u32,
    pub salt_bytes: u32,
    pub estimated_cpu_instructions: u64,
    pub estimated_memory_bytes: u64,
}

/// Deployment metadata returned by [`crate:: RustAcademyContract::get_deployment_metadata`].
///
/// Clients and indexers can call this view to validate compatibility without
/// any off-chain coordination.
///
/// ## Domain separation
///
/// `contract_id` is the on-chain address of this contract instance, which
/// uniquely binds the metadata to a specific deployment and network.  Two
/// contracts on different networks will always have different `contract_id`
/// values, so callers can detect cross-network mismatches by comparing
/// `contract_id` against the address they invoked.
///
/// ## Schema stability
///
/// The field set of this struct is part of the public API.  Fields must not be
/// removed or reordered across releases; new optional fields may be appended.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeploymentMetadata {
    /// Stored contract schema version (see [`crate::storage::CURRENT_CONTRACT_VERSION`]).
    /// Returns `0` for legacy deployments that pre-date version tracking.
    pub contract_version: u32,
    /// Event schema version (see [`crate::events::EVENT_SCHEMA_VERSION`]).
    /// Indexers must check this before decoding event payloads.
    pub event_schema_version: u32,
    /// 32-byte WASM hash recorded at the last `upgrade()` call.
    /// `None` when the contract has never been upgraded (initial deployment).
    pub wasm_hash: Option<BytesN<32>>,
    /// On-chain address of this contract instance.
    /// Binds the metadata to a specific deployment and network.
    pub contract_id: Address,
}

/// Contract health summary returned by read-only metadata probes.
///
/// This struct is intentionally non-mutating: all values are derived from
/// existing contract state and can be called by anyone.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractHealth {
    /// Human-readable status symbol, e.g. `Symbol::new(env, "healthy")`.
    pub status: Symbol,
    /// True when the legacy global pause flag is set.
    pub paused: bool,
    /// True when the contract is in emergency mode.
    pub emergency_mode: bool,
    /// True when an upgrade is currently in progress.
    pub upgrade_in_progress: bool,
}

/// Feature flags describing the capabilities supported by this contract build.
///
/// Consumers can use these flags to detect whether optional flows (e.g. upgrade
/// gating, stealth escrows) are available before sending writes.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct FeatureFlags {
    pub upgrade_gating: bool,
    pub privacy: bool,
    pub partial_payment: bool,
    pub stealth: bool,
    pub fee_router: bool,
    pub oracle_fees: bool,
    pub hooks: bool,
}

/// State of the upgrade gating mechanism.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeState {
    /// Whether an upgrade is in progress (between start_upgrade and complete_upgrade).
    pub in_progress: bool,
    /// Version recorded during start_upgrade, if any.
    pub pending_version: Option<u32>,
    /// WASM hash recorded during start_upgrade, if any.
    pub pending_wasm_hash: Option<BytesN<32>>,
    /// Whether the current ledger timestamp is within the active upgrade window.
    pub window_active: bool,
    /// Start of the upgrade window (epoch seconds). 0 means no window set.
    pub window_start: u64,
    /// End of the upgrade window (epoch seconds). 0 means no upper bound.
    pub window_end: u64,
}

/// Versions supported by the current deployment.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SupportedVersions {
    /// Current stored contract version.
    pub contract_version: u32,
    /// Current event schema version.
    pub event_schema_version: u32,
    /// Minimum contract version this build can migrate from.
    pub min_contract_version: u32,
    /// Minimum event schema version this build can emit.
    pub min_event_schema_version: u32,
    /// All event schema versions supported by this build (sorted ascending).
    pub supported_event_versions: Vec<u32>,
}

/// Result of a schema-compatibility probe against a caller-supplied version pair.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SchemaCompatibility {
    /// Whether the requested contract version is supported by this deployment.
    pub contract_compatible: bool,
    /// Whether the requested event schema version is supported by this deployment.
    pub event_compatible: bool,
    /// True only when both requested versions are compatible.
    pub overall_compatible: bool,
    /// Current stored contract version.
    pub current_contract: u32,
    /// Current event schema version.
    pub current_event: u32,
    /// Requested contract version from the caller.
    pub requested_contract: u32,
    /// Requested event schema version from the caller.
    pub requested_event: u32,
}

/// Hook event kinds used for external callbacks.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u32)]
pub enum HookEventKind {
    Create = 1,
    Settle = 2,
    Refund = 3,
}

/// Privileged roles for contract governance and operations.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u32)]
pub enum Role {
    /// Full administrative access, including role management and upgrades.
    Admin = 1,
    /// Operational access, such as toggling pause flags and fee config.
    Operator = 2,
    /// Authorized to resolve disputes across escrows.
    Arbiter = 3,
}

/// Build-time manifest embedded in the WASM artifact.
///
/// This metadata is generated at compile time and provides deterministic
/// correlation between deployed WASM artifacts and their source code.
///
/// ## Invariants
///
/// - `git_hash` is set to the full commit hash if available, otherwise "unknown"
/// - `build_timestamp` is the UNIX epoch time when the WASM was built
/// - `source_hash` is a deterministic hash of all Rust source files
/// - `schema_version` is the manifest format version (increment on breaking changes)
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BuildManifest {
    /// Full git commit hash of the build source.
    pub git_hash: BytesN<32>,
    /// Build timestamp in seconds since UNIX epoch.
    pub build_timestamp: u64,
    /// Hash of the source files (first 32 bytes of BLAKE3 hash).
    pub source_hash: BytesN<32>,
    /// Schema version for the build manifest format.
    pub schema_version: u32,
}
