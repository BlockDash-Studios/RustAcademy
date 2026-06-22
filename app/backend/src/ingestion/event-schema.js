"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RustAcademy_EVENT_COMPATIBILITY = exports.RustAcademy_EVENT_SCHEMA_CONTRACTS = exports.RustAcademy_EVENT_TOPICS = exports.RustAcademy_EVENT_SCHEMA_VERSION = void 0;
exports.RustAcademy_EVENT_SCHEMA_VERSION = 2;
exports.RustAcademy_EVENT_TOPICS = {
    admin: "TOPIC_ADMIN",
    dispute: "TOPIC_DISPUTE",
    escrow: "TOPIC_ESCROW",
    privacy: "TOPIC_PRIVACY",
    stealth: "TOPIC_STEALTH",
};
// payloadKeys are sorted alphabetically.
// "ledger_sequence" ('l') sorts after 'f*' / 'e*' keys and before 'p*' / 'r*' / 's*' keys.
exports.RustAcademy_EVENT_SCHEMA_CONTRACTS = {
    EscrowDeposited: {
        topic: exports.RustAcademy_EVENT_TOPICS.escrow,
        eventName: "EscrowDeposited",
        indexedFields: ["escrow_id", "owner"],
        payloadKeys: [
            "amount_due",
            "amount_paid",
            "expires_at",
            "ledger_sequence",
            "schema_version",
            "timestamp",
            "token",
        ],
        schemaVersion: exports.RustAcademy_EVENT_SCHEMA_VERSION,
        compatibleVersions: [1, exports.RustAcademy_EVENT_SCHEMA_VERSION],
    },
    EscrowWithdrawn: {
        topic: exports.RustAcademy_EVENT_TOPICS.escrow,
        eventName: "EscrowWithdrawn",
        indexedFields: ["escrow_id", "owner"],
        payloadKeys: ["amount", "fee", "ledger_sequence", "schema_version", "timestamp", "token"],
        schemaVersion: exports.RustAcademy_EVENT_SCHEMA_VERSION,
        compatibleVersions: [1, exports.RustAcademy_EVENT_SCHEMA_VERSION],
    },
    EscrowRefunded: {
        topic: exports.RustAcademy_EVENT_TOPICS.escrow,
        eventName: "EscrowRefunded",
        indexedFields: ["escrow_id", "owner"],
        payloadKeys: ["amount", "ledger_sequence", "schema_version", "timestamp", "token"],
        schemaVersion: exports.RustAcademy_EVENT_SCHEMA_VERSION,
        compatibleVersions: [1, exports.RustAcademy_EVENT_SCHEMA_VERSION],
    },
    PrivacyToggled: {
        topic: exports.RustAcademy_EVENT_TOPICS.privacy,
        eventName: "PrivacyToggled",
        indexedFields: ["owner"],
        payloadKeys: ["enabled", "ledger_sequence", "schema_version", "timestamp"],
        schemaVersion: exports.RustAcademy_EVENT_SCHEMA_VERSION,
        compatibleVersions: [1, exports.RustAcademy_EVENT_SCHEMA_VERSION],
    },
    ContractPaused: {
        topic: exports.RustAcademy_EVENT_TOPICS.admin,
        eventName: "ContractPaused",
        indexedFields: ["admin"],
        payloadKeys: ["ledger_sequence", "paused", "schema_version", "timestamp"],
        schemaVersion: exports.RustAcademy_EVENT_SCHEMA_VERSION,
        compatibleVersions: [exports.RustAcademy_EVENT_SCHEMA_VERSION],
    },
    AdminChanged: {
        topic: exports.RustAcademy_EVENT_TOPICS.admin,
        eventName: "AdminChanged",
        indexedFields: ["old_admin", "new_admin"],
        payloadKeys: ["ledger_sequence", "schema_version", "timestamp"],
        schemaVersion: exports.RustAcademy_EVENT_SCHEMA_VERSION,
        compatibleVersions: [1, exports.RustAcademy_EVENT_SCHEMA_VERSION],
    },
    ContractUpgraded: {
        topic: exports.RustAcademy_EVENT_TOPICS.admin,
        eventName: "ContractUpgraded",
        indexedFields: ["new_wasm_hash", "admin"],
        payloadKeys: ["ledger_sequence", "schema_version", "timestamp"],
        schemaVersion: exports.RustAcademy_EVENT_SCHEMA_VERSION,
        compatibleVersions: [exports.RustAcademy_EVENT_SCHEMA_VERSION],
    },
    EphemeralKeyRegistered: {
        topic: exports.RustAcademy_EVENT_TOPICS.stealth,
        eventName: "EphemeralKeyRegistered",
        indexedFields: ["stealth_address", "eph_pub"],
        payloadKeys: [
            "amount_due",
            "amount_paid",
            "expires_at",
            "ledger_sequence",
            "schema_version",
            "timestamp",
            "token",
        ],
        schemaVersion: exports.RustAcademy_EVENT_SCHEMA_VERSION,
        compatibleVersions: [exports.RustAcademy_EVENT_SCHEMA_VERSION],
    },
    StealthWithdrawn: {
        topic: exports.RustAcademy_EVENT_TOPICS.stealth,
        eventName: "StealthWithdrawn",
        indexedFields: ["stealth_address", "recipient"],
        payloadKeys: ["amount", "ledger_sequence", "schema_version", "timestamp", "token"],
        schemaVersion: exports.RustAcademy_EVENT_SCHEMA_VERSION,
        compatibleVersions: [exports.RustAcademy_EVENT_SCHEMA_VERSION],
    },
};
exports.RustAcademy_EVENT_COMPATIBILITY = Object.fromEntries(Object.entries(exports.RustAcademy_EVENT_SCHEMA_CONTRACTS).map(function (_a) {
    var eventName = _a[0], contract = _a[1];
    return [
        eventName,
        {
            currentVersion: contract.schemaVersion,
            compatibleVersions: contract.compatibleVersions,
            canonicalTopic: contract.topic,
        },
    ];
}));
