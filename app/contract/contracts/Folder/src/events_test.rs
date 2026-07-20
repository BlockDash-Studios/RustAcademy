//! Event schema validation and emitted event cross-checking tests (Issue #312).

#[cfg(test)]
extern crate std;

use crate::{
    events::{
        self, EventSchema, EVENT_REPLAY_FIELDS, EVENT_SCHEMAS,
        EVENT_SCHEMA_VERSION, EVENT_TOPIC_ADMIN,
    },
    stealth,
    types::{DisputeExpiryAction, FeeRatio, PerAssetFeeConfig, StealthDepositParams},
    PauseFlag, RustAcademyContract, RustAcademyContractClient,
};
use soroban_sdk::{
    testutils::{Address as _, Events},
    token, Address, Bytes, BytesN, Env,
};

fn setup() -> (Env, RustAcademyContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(RustAcademyContract, ());
    let client = RustAcademyContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    (env, client, admin)
}

#[test]
fn test_validate_event_schemas_passes_canonical_catalog() {
    let result = events::validate_event_schemas();
    assert!(
        result.is_ok(),
        "Canonical EVENT_SCHEMAS failed validation: {:?}",
        result.err()
    );
}

#[test]
fn test_all_event_schemas_have_unique_names_and_ids() {
    assert!(!EVENT_SCHEMAS.is_empty());
    for (i, schema) in EVENT_SCHEMAS.iter().enumerate() {
        assert!(!schema.name.is_empty(), "Schema at index {} has empty name", i);
        assert!(schema.event_type_id > 0, "Schema {} has zero event_type_id", schema.name);
        assert_eq!(
            schema.schema_version, EVENT_SCHEMA_VERSION,
            "Schema {} version mismatch", schema.name
        );

        for other in EVENT_SCHEMAS.iter().skip(i + 1) {
            assert_ne!(
                schema.name, other.name,
                "Duplicate schema name: {}", schema.name
            );
            assert_ne!(
                schema.event_type_id, other.event_type_id,
                "Duplicate event_type_id between {} and {}", schema.name, other.name
            );
        }
    }
}

#[test]
fn test_event_schemas_topic_namespaces_and_formatting() {
    let valid_namespaces = [
        "TOPIC_ADMIN",
        "TOPIC_DISPUTE",
        "TOPIC_ESCROW",
        "TOPIC_PRIVACY",
        "TOPIC_STEALTH",
    ];

    for schema in EVENT_SCHEMAS {
        assert!(
            schema.topics.len() >= 2,
            "Schema {} topics must have at least 2 elements",
            schema.name
        );
        assert!(
            valid_namespaces.contains(&schema.topics[0]),
            "Schema {} has invalid domain namespace topic[0]: {}",
            schema.name,
            schema.topics[0]
        );
        assert_eq!(
            schema.topics[1], schema.name,
            "Schema {} topic[1] must match schema name",
            schema.name
        );
    }
}

#[test]
fn test_event_schemas_payload_keys_sorting_and_replay_fields() {
    for schema in EVENT_SCHEMAS {
        for window in schema.payload_keys.windows(2) {
            assert!(
                window[0] < window[1],
                "Schema {} payload keys not strictly sorted or contain duplicates: {:?}",
                schema.name,
                schema.payload_keys
            );
        }

        for &replay_field in EVENT_REPLAY_FIELDS {
            assert!(
                schema.payload_keys.contains(&replay_field),
                "Schema {} missing mandatory replay field {}",
                schema.name,
                replay_field
            );
        }
    }
}

#[test]
fn test_cross_check_emitted_events_across_contract_operations() {
    let (env, client, admin) = setup();

    let owner = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = env
        .register_stellar_asset_contract_v2(token_admin)
        .address();
    let token_client = token::StellarAssetClient::new(&env, &token);
    token_client.mint(&owner, &10000);

    let salt = Bytes::from_slice(&env, &[1u8; 32]);

    // 1. Deposit event
    client.deposit(&token, &1000i128, &owner, &salt, &0u64, &None);

    // 2. Privacy toggled event
    client.set_privacy(&owner, &true);

    // 3. Pause flags changed event
    client.pause_features(&admin, &(PauseFlag::Deposit as u64));
    client.unpause_features(&admin, &(PauseFlag::Deposit as u64));

    // 4. Fee collector rotated event
    let new_collector = Address::generate(&env);
    client.rotate_fee_collector(&admin, &new_collector);

    // 5. Per asset fee set event
    let fee_cfg = PerAssetFeeConfig {
        fee_bps: 100,
        arbiter_bps: 50,
        arbiter_fee: FeeRatio { numerator: 1, denominator: 2 },
        platform_fee: FeeRatio { numerator: 1, denominator: 4 },
        collector_fee: FeeRatio { numerator: 1, denominator: 4 },
        schema_version: 1,
    };
    client.set_per_asset_fee(&admin, &token, &fee_cfg);

    // 6. Dispute expiry action set & timeout config set
    client.set_dispute_expiry_action(&admin, &DisputeExpiryAction::RefundOwner);
    client.set_dispute_timeout(&admin, &3600u64);

    // 7. Stealth deposit event (ephemeral key registered)
    let eph_pub = BytesN::from_array(&env, &[88u8; 32]);
    let spend_pub = BytesN::from_array(&env, &[99u8; 32]);
    let shared = stealth::derive_shared_secret(&env, &eph_pub, &spend_pub);
    let stealth_addr = stealth::derive_stealth_address(&env, &spend_pub, &shared);

    let stealth_params = StealthDepositParams {
        sender: owner.clone(),
        token: token.clone(),
        amount_due: 500i128,
        amount_paid: 500i128,
        eph_pub,
        spend_pub,
        stealth_address: stealth_addr,
        timeout_secs: 0u64,
    };
    client.register_ephemeral_key(&stealth_params);

    // Validate all contract emitted events against EVENT_SCHEMAS
    let all_contract_events: std::vec::Vec<_> = env
        .events()
        .all()
        .into_iter()
        .filter(|e| e.0 == client.address)
        .collect();
    assert!(!all_contract_events.is_empty(), "No contract events emitted");

    for (idx, event) in all_contract_events.iter().enumerate() {
        let schema_res = events::validate_emitted_event(&env, &event.1, &event.2);
        assert!(
            schema_res.is_ok(),
            "Emitted contract event at index {} failed validation: {:?}",
            idx,
            schema_res.err()
        );
    }
}

#[test]
fn test_schema_validation_error_cases() {
    // Empty name
    let s_empty_name = EventSchema {
        name: "",
        event_type_id: 100,
        topics: &[EVENT_TOPIC_ADMIN, ""],
        payload_keys: &["event_type_id", "ledger_sequence", "schema_version", "timestamp"],
        schema_version: EVENT_SCHEMA_VERSION,
    };
    assert_eq!(
        events::validate_event_schema_entry(&s_empty_name),
        Err("Event schema name cannot be empty")
    );

    // Zero ETID
    let s_zero_etid = EventSchema {
        name: "TestEvent",
        event_type_id: 0,
        topics: &[EVENT_TOPIC_ADMIN, "TestEvent"],
        payload_keys: &["event_type_id", "ledger_sequence", "schema_version", "timestamp"],
        schema_version: EVENT_SCHEMA_VERSION,
    };
    assert_eq!(
        events::validate_event_schema_entry(&s_zero_etid),
        Err("Event type ID cannot be zero")
    );

    // Version mismatch
    let s_bad_ver = EventSchema {
        name: "TestEvent",
        event_type_id: 100,
        topics: &[EVENT_TOPIC_ADMIN, "TestEvent"],
        payload_keys: &["event_type_id", "ledger_sequence", "schema_version", "timestamp"],
        schema_version: 99,
    };
    assert_eq!(
        events::validate_event_schema_entry(&s_bad_ver),
        Err("Event schema version mismatch")
    );

    // Too few topics
    let s_few_topics = EventSchema {
        name: "TestEvent",
        event_type_id: 100,
        topics: &[EVENT_TOPIC_ADMIN],
        payload_keys: &["event_type_id", "ledger_sequence", "schema_version", "timestamp"],
        schema_version: EVENT_SCHEMA_VERSION,
    };
    assert_eq!(
        events::validate_event_schema_entry(&s_few_topics),
        Err("Event topics must have at least 2 elements")
    );

    // Invalid topic domain
    let s_bad_domain = EventSchema {
        name: "TestEvent",
        event_type_id: 100,
        topics: &["TOPIC_INVALID", "TestEvent"],
        payload_keys: &["event_type_id", "ledger_sequence", "schema_version", "timestamp"],
        schema_version: EVENT_SCHEMA_VERSION,
    };
    assert_eq!(
        events::validate_event_schema_entry(&s_bad_domain),
        Err("Invalid event topic domain namespace")
    );

    // Topic[1] name mismatch
    let s_topic1_mismatch = EventSchema {
        name: "TestEvent",
        event_type_id: 100,
        topics: &[EVENT_TOPIC_ADMIN, "WrongName"],
        payload_keys: &["event_type_id", "ledger_sequence", "schema_version", "timestamp"],
        schema_version: EVENT_SCHEMA_VERSION,
    };
    assert_eq!(
        events::validate_event_schema_entry(&s_topic1_mismatch),
        Err("Second event topic must match event name")
    );

    // Unsorted payload keys
    let s_unsorted_payload = EventSchema {
        name: "TestEvent",
        event_type_id: 100,
        topics: &[EVENT_TOPIC_ADMIN, "TestEvent"],
        payload_keys: &["schema_version", "event_type_id", "ledger_sequence", "timestamp"],
        schema_version: EVENT_SCHEMA_VERSION,
    };
    assert_eq!(
        events::validate_event_schema_entry(&s_unsorted_payload),
        Err("Payload keys must be strictly sorted alphabetically without duplicates")
    );

    // Missing mandatory replay field
    let s_missing_replay = EventSchema {
        name: "TestEvent",
        event_type_id: 100,
        topics: &[EVENT_TOPIC_ADMIN, "TestEvent"],
        payload_keys: &["event_type_id", "schema_version", "timestamp"],
        schema_version: EVENT_SCHEMA_VERSION,
    };
    assert_eq!(
        events::validate_event_schema_entry(&s_missing_replay),
        Err("Missing mandatory event replay field in payload keys")
    );
}
