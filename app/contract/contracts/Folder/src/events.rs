use soroban_sdk::{contractevent, Address, BytesN, Env, Symbol};

/// Canonical event schema version.
///
/// Increment this constant whenever the event payload shape changes
/// (fields added, removed, or renamed). Indexers MUST check this field
/// before parsing any event payload so they can route to the correct
/// decoder for the schema version they understand.
///
/// History:
///   v1 – original schema (no version field)
///   v2 – added `schema_version` to every event payload
///   v2 – added `event_type_id` to every event payload (Issue #38)
pub const EVENT_SCHEMA_VERSION: u32 = 2;

// ---------------------------------------------------------------------------
// Stable event type IDs (Issue #38)
// ---------------------------------------------------------------------------
//
// Every emitted event carries a stable numeric `event_type_id` that MUST NOT
// change across releases, even if the event name or payload shape evolves.
// Backends and indexers use this ID as the primary key for schema routing and
// cross-chain compatibility checks — it is the single source of truth that
// survives renames or payload restructuring.
//
// ID allocation is grouped by domain to leave room for future events:
//   Escrow   1–9
//   Dispute  10–19
//   Privacy  20–29
//   Stealth  30–39
//   Admin    40–79
//
// Rules:
//   * IDs are never reused or renumbered.
//   * When an event is deprecated, its ID is retired (not recycled).
//   * New events receive the next free ID in their domain range.

/// Escrow domain IDs (1–9)
pub const ETID_ESCROW_DEPOSITED: u32 = 1;
pub const ETID_ESCROW_WITHDRAWN: u32 = 2;
pub const ETID_ESCROW_REFUNDED: u32 = 3;
pub const ETID_ESCROW_DISPUTED: u32 = 4;
pub const ETID_ESCROW_FINALIZED: u32 = 5;
pub const ETID_PARTIAL_PAYMENT: u32 = 6;
pub const ETID_AUX_INDICES_CLEANED: u32 = 7;

/// Dispute domain IDs (10–19)
pub const ETID_ARBITER_VOTE_CAST: u32 = 10;
pub const ETID_DISPUTE_RESOLVED: u32 = 11;
pub const ETID_DISPUTE_TIMEOUT_SET: u32 = 12;
pub const ETID_DISPUTE_AUTO_RESOLVED: u32 = 13;
pub const ETID_DISPUTE_EXPIRY_ACTION_SET: u32 = 14;
pub const ETID_DISPUTE_TIMEOUT_CONFIG_SET: u32 = 15;

/// Privacy domain IDs (20–29)
pub const ETID_PRIVACY_TOGGLED: u32 = 20;

/// Stealth domain IDs (30–39)
pub const ETID_EPHEMERAL_KEY_REGISTERED: u32 = 30;
pub const ETID_STEALTH_WITHDRAWN: u32 = 31;
pub const ETID_STEALTH_ESCROW_CLEANED: u32 = 32;

/// Admin domain IDs (40–79)
pub const ETID_ADMIN_CHANGED: u32 = 40;
pub const ETID_CONTRACT_INITIALIZED: u32 = 41;
pub const ETID_CONTRACT_MIGRATED: u32 = 42;
pub const ETID_CONTRACT_PAUSED: u32 = 43;
pub const ETID_CONTRACT_UPGRADED: u32 = 44;
pub const ETID_EMERGENCY_MODE_ACTIVATED: u32 = 45;
pub const ETID_FEE_COLLECTOR_ROTATED: u32 = 46;
pub const ETID_FEE_CONFIG_CHANGED: u32 = 47;
pub const ETID_HOOK_REGISTERED: u32 = 48;
pub const ETID_HOOK_UNREGISTERED: u32 = 49;
pub const ETID_PAUSE_FLAGS_CHANGED: u32 = 50;
pub const ETID_PER_ASSET_FEE_SET: u32 = 51;
pub const ETID_PLATFORM_WALLET_CHANGED: u32 = 52;
pub const ETID_UPGRADE_STARTED: u32 = 53;
pub const ETID_UPGRADE_COMPLETED: u32 = 54;
pub const ETID_UPGRADE_WINDOW_SET: u32 = 55;

/// Testnet event topic namespace used as topic[0] for every  RustAcademy event.
#[allow(dead_code)]
pub const EVENT_TOPIC_ADMIN: &str = "TOPIC_ADMIN";
#[allow(dead_code)]
pub const EVENT_TOPIC_DISPUTE: &str = "TOPIC_DISPUTE";
#[allow(dead_code)]
pub const EVENT_TOPIC_ESCROW: &str = "TOPIC_ESCROW";
#[allow(dead_code)]
pub const EVENT_TOPIC_PRIVACY: &str = "TOPIC_PRIVACY";
#[allow(dead_code)]
pub const EVENT_TOPIC_STEALTH: &str = "TOPIC_STEALTH";

#[allow(dead_code)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct EventSchema {
    pub name: &'static str,
    /// Stable numeric event type ID — never changes across releases.
    pub event_type_id: u32,
    pub topics: &'static [&'static str],
    pub payload_keys: &'static [&'static str],
    pub schema_version: u32,
}

#[allow(dead_code)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct EventCompatibility {
    pub name: &'static str,
    /// Stable numeric event type ID — matches the ID in [`EventSchema`].
    pub event_type_id: u32,
    pub current_version: u32,
    pub compatible_versions: &'static [u32],
}

/// Deterministic replay metadata fields present in every v2+ event payload.
///
/// The `ledger_sequence` field (from `env.ledger().sequence()`) enables
/// backend indexers to cross-validate the contract-reported ledger against
/// the Horizon-reported ledger, and together with `tx_hash` and `paging_token`
/// forms a complete, stable deduplication key for any event delivery.
#[allow(dead_code)]
pub const EVENT_REPLAY_FIELDS: &[&str] = &["event_type_id", "ledger_sequence", "schema_version", "timestamp"];

// payload_keys are sorted alphabetically. "ledger_sequence" sorts between
// 'f*' keys and 's*' keys, i.e. after "fee*"/"from_version" and before "paused"/"recipient"/"schema_version".
#[allow(dead_code)]
pub const EVENT_SCHEMAS: &[EventSchema] = &[
    EventSchema {
        name: "AdminChanged",
        event_type_id: ETID_ADMIN_CHANGED,
        topics: &[EVENT_TOPIC_ADMIN, "AdminChanged", "old_admin", "new_admin"],
        payload_keys: &["event_type_id", "ledger_sequence", "schema_version", "timestamp"],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "ArbiterVoteCast",
        event_type_id: ETID_ARBITER_VOTE_CAST,
        topics: &[
            EVENT_TOPIC_DISPUTE,
            "ArbiterVoteCast",
            "escrow_id",
            "arbiter",
        ],
        payload_keys: &[
            "event_type_id",
            "ledger_sequence",
            "resolve_for_owner",
            "schema_version",
            "threshold",
            "timestamp",
            "vote_count",
        ],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "ContractMigrated",
        event_type_id: ETID_CONTRACT_MIGRATED,
        topics: &[EVENT_TOPIC_ADMIN, "ContractMigrated", "admin"],
        payload_keys: &["event_type_id", "from_version", "ledger_sequence", "schema_version", "timestamp", "to_version"],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "ContractInitialized",
        event_type_id: ETID_CONTRACT_INITIALIZED,
        topics: &[EVENT_TOPIC_ADMIN, "ContractInitialized", "admin"],
        payload_keys: &[
            "contract_version",
            "event_schema_version",
            "event_type_id",
            "ledger_sequence",
            "paused",
            "schema_version",
            "timestamp",
        ],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "ContractPaused",
        event_type_id: ETID_CONTRACT_PAUSED,
        topics: &[EVENT_TOPIC_ADMIN, "ContractPaused", "admin"],
        payload_keys: &["event_type_id", "ledger_sequence", "paused", "schema_version", "timestamp"],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "ContractUpgraded",
        event_type_id: ETID_CONTRACT_UPGRADED,
        topics: &[
            EVENT_TOPIC_ADMIN,
            "ContractUpgraded",
            "new_wasm_hash",
            "admin",
        ],
        payload_keys: &["event_type_id", "ledger_sequence", "schema_version", "timestamp"],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "DisputeResolved",
        event_type_id: ETID_DISPUTE_RESOLVED,
        topics: &[
            EVENT_TOPIC_DISPUTE,
            "DisputeResolved",
            "escrow_id",
            "resolved_for_owner",
        ],
        payload_keys: &[
            "amount",
            "event_type_id",
            "ledger_sequence",
            "schema_version",
            "threshold",
            "timestamp",
            "total_votes",
        ],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "DisputeTimeoutSet",
        event_type_id: ETID_DISPUTE_TIMEOUT_SET,
        topics: &[
            EVENT_TOPIC_DISPUTE,
            "DisputeTimeoutSet",
            "escrow_id",
        ],
        payload_keys: &[
            "action",
            "event_type_id",
            "expires_at",
            "ledger_sequence",
            "schema_version",
            "timestamp",
        ],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "DisputeAutoResolved",
        event_type_id: ETID_DISPUTE_AUTO_RESOLVED,
        topics: &[
            EVENT_TOPIC_DISPUTE,
            "DisputeAutoResolved",
            "escrow_id",
            "action",
        ],
        payload_keys: &[
            "amount",
            "event_type_id",
            "ledger_sequence",
            "recipient",
            "schema_version",
            "timestamp",
        ],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "DisputeExpiryActionSet",
        event_type_id: ETID_DISPUTE_EXPIRY_ACTION_SET,
        topics: &[EVENT_TOPIC_ADMIN, "DisputeExpiryActionSet"],
        payload_keys: &["action", "event_type_id", "ledger_sequence", "schema_version", "timestamp"],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "DisputeTimeoutConfigSet",
        event_type_id: ETID_DISPUTE_TIMEOUT_CONFIG_SET,
        topics: &[EVENT_TOPIC_ADMIN, "DisputeTimeoutConfigSet"],
        payload_keys: &["event_type_id", "ledger_sequence", "schema_version", "timeout_secs", "timestamp"],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "EmergencyModeActivated",
        event_type_id: ETID_EMERGENCY_MODE_ACTIVATED,
        topics: &[EVENT_TOPIC_ADMIN, "EmergencyModeActivated", "admin"],
        payload_keys: &["event_type_id", "ledger_sequence", "schema_version", "timestamp"],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "EphemeralKeyRegistered",
        event_type_id: ETID_EPHEMERAL_KEY_REGISTERED,
        topics: &[
            EVENT_TOPIC_STEALTH,
            "EphemeralKeyRegistered",
            "stealth_address",
            "eph_pub",
        ],
        payload_keys: &[
            "amount_due",
            "amount_paid",
            "event_type_id",
            "expires_at",
            "ledger_sequence",
            "schema_version",
            "timestamp",
            "token",
        ],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "EscrowDeposited",
        event_type_id: ETID_ESCROW_DEPOSITED,
        topics: &[EVENT_TOPIC_ESCROW, "EscrowDeposited", "escrow_id", "owner"],
        payload_keys: &[
            "amount_due",
            "amount_paid",
            "event_type_id",
            "expires_at",
            "ledger_sequence",
            "schema_version",
            "timestamp",
            "token",
        ],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "EscrowDisputed",
        event_type_id: ETID_ESCROW_DISPUTED,
        topics: &[EVENT_TOPIC_ESCROW, "EscrowDisputed", "escrow_id", "arbiter"],
        payload_keys: &["event_type_id", "ledger_sequence", "schema_version", "timestamp"],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "EscrowFinalized",
        event_type_id: ETID_ESCROW_FINALIZED,
        topics: &[EVENT_TOPIC_ESCROW, "EscrowFinalized", "escrow_id", "owner"],
        payload_keys: &["event_type_id", "ledger_sequence", "schema_version", "timestamp", "token", "total_amount"],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "EscrowRefunded",
        event_type_id: ETID_ESCROW_REFUNDED,
        topics: &[EVENT_TOPIC_ESCROW, "EscrowRefunded", "escrow_id", "owner"],
        payload_keys: &["amount", "event_type_id", "ledger_sequence", "schema_version", "timestamp", "token"],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "EscrowWithdrawn",
        event_type_id: ETID_ESCROW_WITHDRAWN,
        topics: &[EVENT_TOPIC_ESCROW, "EscrowWithdrawn", "escrow_id", "owner"],
        payload_keys: &["amount", "event_type_id", "fee", "ledger_sequence", "schema_version", "timestamp", "token"],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "FeeCollectorRotated",
        event_type_id: ETID_FEE_COLLECTOR_ROTATED,
        topics: &[EVENT_TOPIC_ADMIN, "FeeCollectorRotated", "new_collector"],
        payload_keys: &["event_type_id", "ledger_sequence", "rotation_index", "schema_version", "timestamp"],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "FeeConfigChanged",
        event_type_id: ETID_FEE_CONFIG_CHANGED,
        topics: &[EVENT_TOPIC_ADMIN, "FeeConfigChanged"],
        payload_keys: &["event_type_id", "fee_bps", "ledger_sequence", "schema_version", "timestamp"],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "PartialPayment",
        event_type_id: ETID_PARTIAL_PAYMENT,
        topics: &[EVENT_TOPIC_ESCROW, "PartialPayment", "escrow_id", "payer"],
        payload_keys: &[
            "amount_due",
            "amount_paid",
            "event_type_id",
            "ledger_sequence",
            "payment_amount",
            "schema_version",
            "timestamp",
            "token",
        ],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "PerAssetFeeSet",
        event_type_id: ETID_PER_ASSET_FEE_SET,
        topics: &[EVENT_TOPIC_ADMIN, "PerAssetFeeSet", "token"],
        payload_keys: &["arbiter_bps", "event_type_id", "fee_bps", "ledger_sequence", "schema_version", "timestamp"],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "PlatformWalletChanged",
        event_type_id: ETID_PLATFORM_WALLET_CHANGED,
        topics: &[EVENT_TOPIC_ADMIN, "PlatformWalletChanged", "wallet"],
        payload_keys: &["event_type_id", "ledger_sequence", "schema_version", "timestamp"],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "PrivacyToggled",
        event_type_id: ETID_PRIVACY_TOGGLED,
        topics: &[EVENT_TOPIC_PRIVACY, "PrivacyToggled", "owner"],
        payload_keys: &["enabled", "event_type_id", "ledger_sequence", "schema_version", "timestamp"],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "StealthWithdrawn",
        event_type_id: ETID_STEALTH_WITHDRAWN,
        topics: &[
            EVENT_TOPIC_STEALTH,
            "StealthWithdrawn",
            "stealth_address",
            "recipient",
        ],
        payload_keys: &["amount", "event_type_id", "ledger_sequence", "schema_version", "timestamp", "token"],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "UpgradeStarted",
        event_type_id: ETID_UPGRADE_STARTED,
        topics: &[EVENT_TOPIC_ADMIN, "UpgradeStarted", "admin"],
        payload_keys: &[
            "event_type_id",
            "ledger_sequence",
            "new_version",
            "new_wasm_hash",
            "old_version",
            "schema_version",
            "timestamp",
            "window_end",
            "window_start",
        ],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "UpgradeCompleted",
        event_type_id: ETID_UPGRADE_COMPLETED,
        topics: &[EVENT_TOPIC_ADMIN, "UpgradeCompleted", "admin"],
        payload_keys: &[
            "event_type_id",
            "ledger_sequence",
            "new_version",
            "old_version",
            "schema_version",
            "timestamp",
        ],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "HookRegistered",
        event_type_id: ETID_HOOK_REGISTERED,
        topics: &[EVENT_TOPIC_ADMIN, "HookRegistered", "hook_contract"],
        payload_keys: &["event_type_id", "ledger_sequence", "schema_version", "timestamp"],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "HookUnregistered",
        event_type_id: ETID_HOOK_UNREGISTERED,
        topics: &[EVENT_TOPIC_ADMIN, "HookUnregistered", "hook_contract"],
        payload_keys: &["event_type_id", "ledger_sequence", "schema_version", "timestamp"],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "UpgradeWindowSet",
        event_type_id: ETID_UPGRADE_WINDOW_SET,
        topics: &[EVENT_TOPIC_ADMIN, "UpgradeWindowSet", "admin"],
        payload_keys: &["event_type_id", "ledger_sequence", "schema_version", "timestamp", "window_end", "window_start"],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "PauseFlagsChanged",
        event_type_id: ETID_PAUSE_FLAGS_CHANGED,
        topics: &[EVENT_TOPIC_ADMIN, "PauseFlagsChanged", "admin"],
        payload_keys: &["event_type_id", "flags_disabled", "flags_enabled", "ledger_sequence", "schema_version", "timestamp"],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "AuxIndicesCleaned",
        event_type_id: ETID_AUX_INDICES_CLEANED,
        topics: &[EVENT_TOPIC_ESCROW, "AuxIndicesCleaned", "escrow_id"],
        payload_keys: &["event_type_id", "indices_removed", "ledger_sequence", "schema_version", "timestamp"],
        schema_version: EVENT_SCHEMA_VERSION,
    },
    EventSchema {
        name: "StealthEscrowCleaned",
        event_type_id: ETID_STEALTH_ESCROW_CLEANED,
        topics: &[EVENT_TOPIC_STEALTH, "StealthEscrowCleaned", "stealth_address"],
        payload_keys: &["event_type_id", "ledger_sequence", "schema_version", "timestamp"],
        schema_version: EVENT_SCHEMA_VERSION,
    },
];

#[allow(dead_code)]
pub const EVENT_COMPATIBILITY: &[EventCompatibility] = &[
    EventCompatibility {
        name: "AdminChanged",
        event_type_id: ETID_ADMIN_CHANGED,
        current_version: EVENT_SCHEMA_VERSION,
        compatible_versions: &[1, EVENT_SCHEMA_VERSION],
    },
    EventCompatibility {
        name: "EscrowDeposited",
        event_type_id: ETID_ESCROW_DEPOSITED,
        current_version: EVENT_SCHEMA_VERSION,
        compatible_versions: &[1, EVENT_SCHEMA_VERSION],
    },
    EventCompatibility {
        name: "EscrowRefunded",
        event_type_id: ETID_ESCROW_REFUNDED,
        current_version: EVENT_SCHEMA_VERSION,
        compatible_versions: &[1, EVENT_SCHEMA_VERSION],
    },
    EventCompatibility {
        name: "EscrowWithdrawn",
        event_type_id: ETID_ESCROW_WITHDRAWN,
        current_version: EVENT_SCHEMA_VERSION,
        compatible_versions: &[1, EVENT_SCHEMA_VERSION],
    },
    EventCompatibility {
        name: "PrivacyToggled",
        event_type_id: ETID_PRIVACY_TOGGLED,
        current_version: EVENT_SCHEMA_VERSION,
        compatible_versions: &[1, EVENT_SCHEMA_VERSION],
    },
    EventCompatibility {
        name: "DisputeTimeoutSet",
        event_type_id: ETID_DISPUTE_TIMEOUT_SET,
        current_version: EVENT_SCHEMA_VERSION,
        compatible_versions: &[EVENT_SCHEMA_VERSION],
    },
    EventCompatibility {
        name: "DisputeAutoResolved",
        event_type_id: ETID_DISPUTE_AUTO_RESOLVED,
        current_version: EVENT_SCHEMA_VERSION,
        compatible_versions: &[EVENT_SCHEMA_VERSION],
    },
    EventCompatibility {
        name: "DisputeExpiryActionSet",
        event_type_id: ETID_DISPUTE_EXPIRY_ACTION_SET,
        current_version: EVENT_SCHEMA_VERSION,
        compatible_versions: &[EVENT_SCHEMA_VERSION],
    },
    EventCompatibility {
        name: "DisputeTimeoutConfigSet",
        event_type_id: ETID_DISPUTE_TIMEOUT_CONFIG_SET,
        current_version: EVENT_SCHEMA_VERSION,
        compatible_versions: &[EVENT_SCHEMA_VERSION],
    },
];


#[contractevent(topics = ["TOPIC_ADMIN", "EmergencyModeActivated"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EmergencyModeActivatedEvent {
    #[topic]
    pub admin: Address,
    pub event_type_id: u32,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub timestamp: u64,
}

pub(crate) fn publish_emergency_mode_activated(env: &Env, admin: Address) {
    EmergencyModeActivatedEvent {
        admin,
        event_type_id: ETID_EMERGENCY_MODE_ACTIVATED,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

#[contractevent(topics = ["TOPIC_PRIVACY", "PrivacyToggled"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PrivacyToggledEvent {
    #[topic]
    pub owner: Address,

    pub event_type_id: u32,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub enabled: bool,
    pub timestamp: u64,
}

#[contractevent(topics = ["TOPIC_ESCROW", "EscrowWithdrawn"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowWithdrawnEvent {
    #[topic]
    pub escrow_id: BytesN<32>,

    #[topic]
    pub owner: Address,

    pub event_type_id: u32,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub token: Address,
    pub amount: i128,
    pub fee: i128,
    pub arbiter_fee: i128,
    pub platform_fee: i128,
    pub collector_fee: i128,
    pub net_payout: i128,
    pub timestamp: u64,
}

#[contractevent(topics = ["TOPIC_ESCROW", "EscrowDeposited"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowDepositedEvent {
    #[topic]
    pub escrow_id: BytesN<32>,

    #[topic]
    pub owner: Address,

    pub event_type_id: u32,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub token: Address,
    pub amount_due: i128,
    pub amount_paid: i128,
    pub expires_at: u64,
    pub timestamp: u64,
}

pub(crate) fn publish_privacy_toggled(env: &Env, owner: Address, enabled: bool) {
    PrivacyToggledEvent {
        owner,
        enabled,
        event_type_id: ETID_PRIVACY_TOGGLED,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

#[allow(dead_code)]
#[contractevent(topics = ["TOPIC_ADMIN", "ContractInitialized"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractInitializedEvent {
    #[topic]
    pub admin: Address,

    pub event_type_id: u32,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub contract_version: u32,
    pub event_schema_version: u32,
    pub paused: bool,
    pub timestamp: u64,
}

#[allow(dead_code)]
pub(crate) fn publish_contract_initialized(
    env: &Env,
    admin: Address,
    contract_version: u32,
    event_schema_version: u32,
    paused: bool,
) {
    ContractInitializedEvent {
        admin,
        event_type_id: ETID_CONTRACT_INITIALIZED,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        contract_version,
        event_schema_version,
        paused,
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

#[allow(dead_code)]
#[contractevent(topics = ["TOPIC_ADMIN", "ContractPaused"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractPausedEvent {
    #[topic]
    pub admin: Address,

    pub event_type_id: u32,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub paused: bool,
    pub timestamp: u64,
}

#[allow(dead_code)]
pub(crate) fn publish_contract_paused(env: &Env, admin: Address, paused: bool) {
    ContractPausedEvent {
        admin,
        event_type_id: ETID_CONTRACT_PAUSED,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        paused,
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

#[allow(dead_code)]
#[contractevent(topics = ["TOPIC_ADMIN", "AdminChanged"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminChangedEvent {
    #[topic]
    pub old_admin: Address,
    #[topic]
    pub new_admin: Address,

    pub event_type_id: u32,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub timestamp: u64,
}

#[allow(dead_code)]
pub(crate) fn publish_admin_changed(env: &Env, old_admin: Address, new_admin: Address) {
    AdminChangedEvent {
        old_admin,
        new_admin,
        event_type_id: ETID_ADMIN_CHANGED,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

#[contractevent(topics = ["TOPIC_ADMIN", "ContractUpgraded"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractUpgradedEvent {
    #[topic]
    pub new_wasm_hash: BytesN<32>,

    #[topic]
    pub admin: Address,

    pub event_type_id: u32,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub timestamp: u64,
}

#[contractevent(topics = ["TOPIC_ADMIN", "UpgradeStarted"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeStartedEvent {
    #[topic]
    pub admin: Address,

    pub event_type_id: u32,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub old_version: u32,
    pub new_version: u32,
    pub new_wasm_hash: BytesN<32>,
    pub window_start: u64,
    pub window_end: u64,
    pub timestamp: u64,
}

#[contractevent(topics = ["TOPIC_ADMIN", "UpgradeCompleted"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeCompletedEvent {
    #[topic]
    pub admin: Address,

    pub event_type_id: u32,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub old_version: u32,
    pub new_version: u32,
    pub timestamp: u64,
}

pub(crate) fn publish_contract_upgraded(env: &Env, new_wasm_hash: BytesN<32>, admin: &Address) {
    ContractUpgradedEvent {
        new_wasm_hash,
        admin: admin.clone(),
        event_type_id: ETID_CONTRACT_UPGRADED,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

pub(crate) fn publish_upgrade_started(
    env: &Env,
    admin: &Address,
    old_version: u32,
    new_version: u32,
    new_wasm_hash: BytesN<32>,
    window_start: u64,
    window_end: u64,
) {
    UpgradeStartedEvent {
        admin: admin.clone(),
        event_type_id: ETID_UPGRADE_STARTED,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        old_version,
        new_version,
        new_wasm_hash,
        window_start,
        window_end,
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

pub(crate) fn publish_upgrade_completed(
    env: &Env,
    admin: &Address,
    old_version: u32,
    new_version: u32,
) {
    UpgradeCompletedEvent {
        admin: admin.clone(),
        event_type_id: ETID_UPGRADE_COMPLETED,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        old_version,
        new_version,
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

#[contractevent(topics = ["TOPIC_ADMIN", "ContractMigrated"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractMigratedEvent {
    #[topic]
    pub admin: Address,

    pub event_type_id: u32,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub from_version: u32,
    pub to_version: u32,
    pub timestamp: u64,
}

pub(crate) fn publish_contract_migrated(
    env: &Env,
    admin: &Address,
    from_version: u32,
    to_version: u32,
) {
    ContractMigratedEvent {
        admin: admin.clone(),
        event_type_id: ETID_CONTRACT_MIGRATED,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        from_version,
        to_version,
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

pub(crate) fn publish_escrow_withdrawn(
    env: &Env,
    commitment: BytesN<32>,
    owner: Address,
    token: Address,
    amount: i128,
    fee: i128,
    arbiter_fee: i128,
    platform_fee: i128,
    collector_fee: i128,
    net_payout: i128,
) {
    EscrowWithdrawnEvent {
        escrow_id: commitment,
        owner,
        event_type_id: ETID_ESCROW_WITHDRAWN,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        token,
        amount,
        fee,
        arbiter_fee,
        platform_fee,
        collector_fee,
        net_payout,
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

pub(crate) fn publish_escrow_deposited(
    env: &Env,
    commitment: BytesN<32>,
    owner: Address,
    token: Address,
    amount_due: i128,
    amount_paid: i128,
    expires_at: u64,
) {
    EscrowDepositedEvent {
        escrow_id: commitment,
        owner,
        event_type_id: ETID_ESCROW_DEPOSITED,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        token,
        amount_due,
        amount_paid,
        expires_at,
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

#[contractevent(topics = ["TOPIC_ESCROW", "EscrowRefunded"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowRefundedEvent {
    #[topic]
    pub escrow_id: BytesN<32>,

    #[topic]
    pub owner: Address,

    pub event_type_id: u32,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub token: Address,
    pub amount: i128,
    pub timestamp: u64,
}

#[contractevent(topics = ["TOPIC_ESCROW", "PartialPayment"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PartialPaymentEvent {
    #[topic]
    pub escrow_id: BytesN<32>,

    #[topic]
    pub payer: Address,

    pub event_type_id: u32,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub token: Address,
    pub payment_amount: i128,
    pub amount_paid: i128,
    pub amount_due: i128,
    pub timestamp: u64,
}

#[contractevent(topics = ["TOPIC_ESCROW", "EscrowFinalized"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowFinalizedEvent {
    #[topic]
    pub escrow_id: BytesN<32>,

    #[topic]
    pub owner: Address,

    pub event_type_id: u32,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub token: Address,
    pub total_amount: i128,
    pub timestamp: u64,
}

#[contractevent(topics = ["TOPIC_ESCROW", "EscrowDisputed"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowDisputedEvent {
    #[topic]
    pub escrow_id: BytesN<32>,

    #[topic]
    pub arbiter: Address,

    pub event_type_id: u32,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub timestamp: u64,
}

pub(crate) fn publish_escrow_disputed(env: &Env, commitment: BytesN<32>, arbiter: Address) {
    EscrowDisputedEvent {
        escrow_id: commitment,
        arbiter,
        event_type_id: ETID_ESCROW_DISPUTED,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

pub(crate) fn publish_escrow_refunded(
    env: &Env,
    owner: Address,
    commitment: BytesN<32>,
    token: Address,
    amount: i128,
) {
    EscrowRefundedEvent {
        escrow_id: commitment,
        owner,
        event_type_id: ETID_ESCROW_REFUNDED,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        token,
        amount,
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

/// Emitted when terminal-escrow cleanup removes auxiliary index entries
/// (dedup mapping, reverse index, dispute votes) for a commitment.
///
/// Indexers should treat the referenced `escrow_id` (commitment) and its
/// derived `escrow_id` dedup key as fully removed; `indices_removed` is the
/// count of auxiliary entries reclaimed in this call.
#[contractevent(topics = ["TOPIC_ESCROW", "AuxIndicesCleaned"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuxIndicesCleanedEvent {
    #[topic]
    pub escrow_id: BytesN<32>,
    
    pub event_type_id: u32,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    /// Number of auxiliary index entries removed during cleanup.
    pub indices_removed: u32,
    pub timestamp: u64,
}

pub(crate) fn publish_aux_indices_cleaned(
    env: &Env,
    commitment: BytesN<32>,
    indices_removed: u32,
) {
    AuxIndicesCleanedEvent {
        escrow_id: commitment,
        event_type_id: ETID_AUX_INDICES_CLEANED,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        indices_removed,
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

pub(crate) fn publish_partial_payment(
    env: &Env,
    commitment: BytesN<32>,
    payer: Address,
    token: Address,
    payment_amount: i128,
    amount_paid: i128,
    amount_due: i128,
) {
    PartialPaymentEvent {
        escrow_id: commitment,
        payer,
        event_type_id: ETID_PARTIAL_PAYMENT,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        token,
        payment_amount,
        amount_paid,
        amount_due,
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

pub(crate) fn publish_escrow_finalized(
    env: &Env,
    commitment: BytesN<32>,
    owner: Address,
    token: Address,
    total_amount: i128,
) {
    EscrowFinalizedEvent {
        escrow_id: commitment,
        owner,
        event_type_id: ETID_ESCROW_FINALIZED,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        token,
        total_amount,
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

// ---------------------------------------------------------------------------
// Stealth address events (Privacy v2 – Issue #157)
// ---------------------------------------------------------------------------

#[contractevent(topics = ["TOPIC_STEALTH", "EphemeralKeyRegistered"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EphemeralKeyRegisteredEvent {
    /// One-time stealth address (indexed for scanning).
    #[topic]
    pub stealth_address: BytesN<32>,

    /// Sender's ephemeral public key (indexed so recipient can scan).
    #[topic]
    pub eph_pub: BytesN<32>,

    pub event_type_id: u32,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub token: Address,
    pub amount_due: i128,
    pub amount_paid: i128,
    pub expires_at: u64,
    pub timestamp: u64,
}

pub(crate) fn publish_ephemeral_key_registered(
    env: &Env,
    stealth_address: BytesN<32>,
    eph_pub: BytesN<32>,
    token: Address,
    amount_due: i128,
    amount_paid: i128,
    expires_at: u64,
) {
    EphemeralKeyRegisteredEvent {
        stealth_address,
        eph_pub,
        event_type_id: ETID_EPHEMERAL_KEY_REGISTERED,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        token,
        amount_due,
        amount_paid,
        expires_at,
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

#[contractevent(topics = ["TOPIC_STEALTH", "StealthWithdrawn"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StealthWithdrawnEvent {
    /// One-time stealth address (indexed).
    #[topic]
    pub stealth_address: BytesN<32>,

    /// Recipient's real address – only revealed at withdrawal time.
    #[topic]
    pub recipient: Address,

    pub event_type_id: u32,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub token: Address,
    pub amount: i128,
    pub timestamp: u64,
}

pub(crate) fn publish_stealth_withdrawn(
    env: &Env,
    stealth_address: BytesN<32>,
    recipient: Address,
    token: Address,
    amount: i128,
) {
    StealthWithdrawnEvent {
        stealth_address,
        recipient,
        event_type_id: ETID_STEALTH_WITHDRAWN,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        token,
        amount,
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

/// Emitted when a terminal (withdrawn/refunded) stealth escrow entry is
/// removed from storage to reclaim its deposit (Issue #51). Indexers should
/// treat the stealth address as fully cleaned up afterwards.
#[contractevent(topics = ["TOPIC_STEALTH", "StealthEscrowCleaned"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StealthEscrowCleanedEvent {
    #[topic]
    pub stealth_address: BytesN<32>,
    
    pub event_type_id: u32,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub timestamp: u64,
}

pub(crate) fn publish_stealth_escrow_cleaned(env: &Env, stealth_address: BytesN<32>) {
    StealthEscrowCleanedEvent {
        stealth_address,
        event_type_id: ETID_STEALTH_ESCROW_CLEANED,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

#[contractevent(topics = ["TOPIC_ADMIN", "FeeConfigChanged"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeConfigChangedEvent {
    pub event_type_id: u32,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub fee_bps: u32,
    pub timestamp: u64,
}

pub(crate) fn publish_fee_config_changed(env: &Env, fee_bps: u32) {
    FeeConfigChangedEvent {
        event_type_id: ETID_FEE_CONFIG_CHANGED,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        fee_bps,
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

#[contractevent(topics = ["TOPIC_ADMIN", "PlatformWalletChanged"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlatformWalletChangedEvent {
    #[topic]
    pub wallet: Address,
    
    pub event_type_id: u32,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub timestamp: u64,
}

pub(crate) fn publish_platform_wallet_changed(env: &Env, wallet: Address) {
    PlatformWalletChangedEvent {
        wallet,
        event_type_id: ETID_PLATFORM_WALLET_CHANGED,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

// ---------------------------------------------------------------------------
// Multi-sig arbiter events
// ---------------------------------------------------------------------------

#[contractevent(topics = ["TOPIC_DISPUTE", "ArbiterVoteCast"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ArbiterVoteCastEvent {
    #[topic]
    pub escrow_id: BytesN<32>,

    #[topic]
    pub arbiter: Address,

    pub event_type_id: u32,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub resolve_for_owner: bool,
    pub vote_count: u32,
    pub threshold: u32,
    pub timestamp: u64,
}

pub(crate) fn publish_arbiter_vote_cast(
    env: &Env,
    commitment: BytesN<32>,
    arbiter: Address,
    resolve_for_owner: bool,
    vote_count: u32,
    threshold: u32,
) {
    ArbiterVoteCastEvent {
        escrow_id: commitment,
        arbiter,
        event_type_id: ETID_ARBITER_VOTE_CAST,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        resolve_for_owner,
        vote_count,
        threshold,
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

#[contractevent(topics = ["TOPIC_DISPUTE", "DisputeResolved"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DisputeResolvedEvent {
    #[topic]
    pub escrow_id: BytesN<32>,

    #[topic]
    pub resolved_for_owner: bool,

    pub event_type_id: u32,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub total_votes: u32,
    pub threshold: u32,
    pub amount: i128,
    pub timestamp: u64,
}

pub(crate) fn publish_dispute_resolved(
    env: &Env,
    commitment: BytesN<32>,
    resolved_for_owner: bool,
    total_votes: u32,
    threshold: u32,
    amount: i128,
) {
    DisputeResolvedEvent {
        escrow_id: commitment,
        resolved_for_owner,
        event_type_id: ETID_DISPUTE_RESOLVED,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        total_votes,
        threshold,
        amount,
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

// ---------------------------------------------------------------------------
// Dispute timeout / auto-resolution events (Issue #49)
// ---------------------------------------------------------------------------

pub(crate) fn dispute_action_symbol(env: &Env, action: crate::types::DisputeExpiryAction) -> Symbol {
    match action {
        crate::types::DisputeExpiryAction::RefundOwner => Symbol::new(env, "refund_owner"),
        crate::types::DisputeExpiryAction::PayArbiter => Symbol::new(env, "pay_arbiter"),
    }
}

#[contractevent(topics = ["TOPIC_DISPUTE", "DisputeTimeoutSet"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DisputeTimeoutSetEvent {
    #[topic]
    pub escrow_id: BytesN<32>,

    pub action: Symbol,
    pub expires_at: u64,
    
    pub event_type_id: u32,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub timestamp: u64,
}

pub(crate) fn publish_dispute_timeout_set(
    env: &Env,
    commitment: BytesN<32>,
    action: crate::types::DisputeExpiryAction,
    expires_at: u64,
) {
    DisputeTimeoutSetEvent {
        escrow_id: commitment,
        action: dispute_action_symbol(env, action),
        expires_at,
        event_type_id: ETID_DISPUTE_TIMEOUT_SET,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

#[contractevent(topics = ["TOPIC_DISPUTE", "DisputeAutoResolved"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DisputeAutoResolvedEvent {
    #[topic]
    pub escrow_id: BytesN<32>,

    #[topic]
    pub action: Symbol,

    pub recipient: Address,
    pub amount: i128,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub timestamp: u64,
}

pub(crate) fn publish_dispute_auto_resolved(
    env: &Env,
    commitment: BytesN<32>,
    action: crate::types::DisputeExpiryAction,
    recipient: Address,
    amount: i128,
) {
    DisputeAutoResolvedEvent {
        escrow_id: commitment,
        action: dispute_action_symbol(env, action),
        recipient,
        amount,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

#[contractevent(topics = ["TOPIC_ADMIN", "DisputeExpiryActionSet"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DisputeExpiryActionSetEvent {
    pub action: Symbol,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub timestamp: u64,
}

pub(crate) fn publish_dispute_expiry_action_set(
    env: &Env,
    action: crate::types::DisputeExpiryAction,
) {
    DisputeExpiryActionSetEvent {
        action: dispute_action_symbol(env, action),
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

#[contractevent(topics = ["TOPIC_ADMIN", "DisputeTimeoutConfigSet"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DisputeTimeoutConfigSetEvent {
    pub timeout_secs: u64,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub timestamp: u64,
}

pub(crate) fn publish_dispute_timeout_config_set(env: &Env, timeout_secs: u64) {
    DisputeTimeoutConfigSetEvent {
        timeout_secs,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

// ---- Fee Router v2 events (Issue #305) -----

#[contractevent(topics = ["TOPIC_ADMIN", "FeeCollectorRotated"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeCollectorRotatedEvent {
    #[topic]
    pub new_collector: Address,
    pub rotation_index: u32,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub timestamp: u64,
}

pub(crate) fn publish_fee_collector_rotated(
    env: &Env,
    new_collector: Address,
    rotation_index: u32,
) {
    FeeCollectorRotatedEvent {
        new_collector,
        rotation_index,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

#[contractevent(topics = ["TOPIC_ADMIN", "PerAssetFeeSet"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PerAssetFeeSetEvent {
    #[topic]
    pub token: Address,
    pub fee_bps: u32,
    pub arbiter_bps: u32,
    pub arbiter_fee_numerator: u32,
    pub arbiter_fee_denominator: u32,
    pub platform_fee_numerator: u32,
    pub platform_fee_denominator: u32,
    pub collector_fee_numerator: u32,
    pub collector_fee_denominator: u32,
    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub timestamp: u64,
}

pub(crate) fn publish_per_asset_fee_set(
    env: &Env,
    token: Address,
    fee_bps: u32,
    arbiter_bps: u32,
    arbiter_fee: crate::types::FeeRatio,
    platform_fee: crate::types::FeeRatio,
    collector_fee: crate::types::FeeRatio,
) {
    PerAssetFeeSetEvent {
        token,
        fee_bps,
        arbiter_bps,
        arbiter_fee_numerator: arbiter_fee.numerator,
        arbiter_fee_denominator: arbiter_fee.denominator,
        platform_fee_numerator: platform_fee.numerator,
        platform_fee_denominator: platform_fee.denominator,
        collector_fee_numerator: collector_fee.numerator,
        collector_fee_denominator: collector_fee.denominator,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

#[contractevent(topics = ["TOPIC_ADMIN", "HookRegistered"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HookRegisteredEvent {
    #[topic]
    pub hook_contract: Address,

    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub timestamp: u64,
}

pub(crate) fn publish_hook_registered(env: &Env, hook_contract: Address) {
    HookRegisteredEvent {
        hook_contract,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

#[contractevent(topics = ["TOPIC_ADMIN", "HookUnregistered"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HookUnregisteredEvent {
    #[topic]
    pub hook_contract: Address,

    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub timestamp: u64,
}

pub(crate) fn publish_hook_unregistered(env: &Env, hook_contract: Address) {
    HookUnregisteredEvent {
        hook_contract,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

#[contractevent(topics = ["TOPIC_ADMIN", "UpgradeWindowSet"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeWindowSetEvent {
    #[topic]
    pub admin: Address,

    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub window_start: u64,
    pub window_end: u64,
    pub timestamp: u64,
}

pub(crate) fn publish_upgrade_window_set(
    env: &Env,
    admin: Address,
    window_start: u64,
    window_end: u64,
) {
    UpgradeWindowSetEvent {
        admin,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        window_start,
        window_end,
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

#[contractevent(topics = ["TOPIC_ADMIN", "PauseFlagsChanged"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PauseFlagsChangedEvent {
    #[topic]
    pub admin: Address,

    pub schema_version: u32,
    pub ledger_sequence: u32,
    pub flags_enabled: u64,
    pub flags_disabled: u64,
    pub timestamp: u64,
}

pub(crate) fn publish_pause_flags_changed(
    env: &Env,
    admin: Address,
    flags_enabled: u64,
    flags_disabled: u64,
) {
    PauseFlagsChangedEvent {
        admin,
        schema_version: EVENT_SCHEMA_VERSION,
        ledger_sequence: env.ledger().sequence(),
        flags_enabled,
        flags_disabled,
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

// -----------------------------------------------------------------------------
// Escrow Cleanup Event (Issue #19)
// -----------------------------------------------------------------------------

#[contractevent(topics = ["TOPIC_ESCROW", "EscrowCleanup"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowCleanupEvent {
    #[topic]
    pub escrow_id: BytesN<32>,

    pub schema_version: u32,
    pub timestamp: u64,
}

pub(crate) fn publish_escrow_cleanup(env: &Env, commitment: BytesN<32>) {
    EscrowCleanupEvent {
        escrow_id: commitment,
        schema_version: EVENT_SCHEMA_VERSION,
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}
