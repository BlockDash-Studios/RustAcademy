export const RustAcademy_EVENT_SCHEMA_VERSION = 2;

export const RustAcademy_EVENT_TOPICS = {
  admin: "TOPIC_ADMIN",
  dispute: "TOPIC_DISPUTE",
  escrow: "TOPIC_ESCROW",
  privacy: "TOPIC_PRIVACY",
  stealth: "TOPIC_STEALTH",
} as const;

export type RustAcademyEventTopic =
  (typeof RustAcademy_EVENT_TOPICS)[keyof typeof RustAcademy_EVENT_TOPICS];

export interface EventSchemaContract {
  topic: RustAcademyEventTopic;
  eventName: string;
  indexedFields: readonly string[];
  payloadKeys: readonly string[];
  schemaVersion: number;
  compatibleVersions: readonly number[];
}

// payloadKeys are sorted alphabetically.
// "ledger_sequence" ('l') sorts after 'f*' / 'e*' keys and before 'p*' / 'r*' / 's*' keys.
export const RustAcademy_EVENT_SCHEMA_CONTRACTS = {
  EscrowDeposited: {
    topic: RustAcademy_EVENT_TOPICS.escrow,
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
    schemaVersion: RustAcademy_EVENT_SCHEMA_VERSION,
    compatibleVersions: [1, RustAcademy_EVENT_SCHEMA_VERSION],
  },
  EscrowWithdrawn: {
    topic: RustAcademy_EVENT_TOPICS.escrow,
    eventName: "EscrowWithdrawn",
    indexedFields: ["escrow_id", "owner"],
    payloadKeys: ["amount", "fee", "ledger_sequence", "schema_version", "timestamp", "token"],
    schemaVersion: RustAcademy_EVENT_SCHEMA_VERSION,
    compatibleVersions: [1, RustAcademy_EVENT_SCHEMA_VERSION],
  },
  EscrowRefunded: {
    topic: RustAcademy_EVENT_TOPICS.escrow,
    eventName: "EscrowRefunded",
    indexedFields: ["escrow_id", "owner"],
    payloadKeys: ["amount", "ledger_sequence", "schema_version", "timestamp", "token"],
    schemaVersion: RustAcademy_EVENT_SCHEMA_VERSION,
    compatibleVersions: [1, RustAcademy_EVENT_SCHEMA_VERSION],
  },
  PrivacyToggled: {
    topic: RustAcademy_EVENT_TOPICS.privacy,
    eventName: "PrivacyToggled",
    indexedFields: ["owner"],
    payloadKeys: ["enabled", "ledger_sequence", "schema_version", "timestamp"],
    schemaVersion: RustAcademy_EVENT_SCHEMA_VERSION,
    compatibleVersions: [1, RustAcademy_EVENT_SCHEMA_VERSION],
  },
  ContractPaused: {
    topic: RustAcademy_EVENT_TOPICS.admin,
    eventName: "ContractPaused",
    indexedFields: ["admin"],
    payloadKeys: ["ledger_sequence", "paused", "schema_version", "timestamp"],
    schemaVersion: RustAcademy_EVENT_SCHEMA_VERSION,
    compatibleVersions: [RustAcademy_EVENT_SCHEMA_VERSION],
  },
  AdminChanged: {
    topic: RustAcademy_EVENT_TOPICS.admin,
    eventName: "AdminChanged",
    indexedFields: ["old_admin", "new_admin"],
    payloadKeys: ["ledger_sequence", "schema_version", "timestamp"],
    schemaVersion: RustAcademy_EVENT_SCHEMA_VERSION,
    compatibleVersions: [1, RustAcademy_EVENT_SCHEMA_VERSION],
  },
  ContractUpgraded: {
    topic: RustAcademy_EVENT_TOPICS.admin,
    eventName: "ContractUpgraded",
    indexedFields: ["new_wasm_hash", "admin"],
    payloadKeys: ["ledger_sequence", "schema_version", "timestamp"],
    schemaVersion: RustAcademy_EVENT_SCHEMA_VERSION,
    compatibleVersions: [RustAcademy_EVENT_SCHEMA_VERSION],
  },
  EphemeralKeyRegistered: {
    topic: RustAcademy_EVENT_TOPICS.stealth,
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
    schemaVersion: RustAcademy_EVENT_SCHEMA_VERSION,
    compatibleVersions: [RustAcademy_EVENT_SCHEMA_VERSION],
  },
  StealthWithdrawn: {
    topic: RustAcademy_EVENT_TOPICS.stealth,
    eventName: "StealthWithdrawn",
    indexedFields: ["stealth_address", "recipient"],
    payloadKeys: ["amount", "ledger_sequence", "schema_version", "timestamp", "token"],
    schemaVersion: RustAcademy_EVENT_SCHEMA_VERSION,
    compatibleVersions: [RustAcademy_EVENT_SCHEMA_VERSION],
  },
} as const satisfies Record<string, EventSchemaContract>;

export const RustAcademy_EVENT_COMPATIBILITY = Object.fromEntries(
  Object.entries(RustAcademy_EVENT_SCHEMA_CONTRACTS).map(
    ([eventName, contract]) => [
      eventName,
      {
        currentVersion: contract.schemaVersion,
        compatibleVersions: contract.compatibleVersions,
        canonicalTopic: contract.topic,
      },
    ],
  ),
) as unknown as Record<
  keyof typeof RustAcademy_EVENT_SCHEMA_CONTRACTS,
  {
    currentVersion: number;
    compatibleVersions: readonly number[];
    canonicalTopic: RustAcademyEventTopic;
  }
>;
