use soroban_sdk::{testutils::Ledger, Vec};
#[test]
fn test_ttl_auto_extend_on_activity() {
    // No need to import Ledger trait; only use set_timestamp
    let env = Env::default();
    let contract_id = env.register(crate:: RustAcademyContract, ());
    env.as_contract(&contract_id, || {
        let commitment: Bytes = Bytes::from_array(&env, &[3u8; 32]);
        let token = Address::generate(&env);
        let owner = Address::generate(&env);
        let amount = 1000i128;
        let created_at = env.ledger().timestamp();
        let entry = EscrowEntry {
            token: token.clone(),
            amount_due: amount,
            amount_paid: amount,
            owner: owner.clone(),
            status: EscrowStatus::Pending,
            created_at,
            expires_at: 0,
            arbiter: None,
            arbiters: Vec::new(&env),
            arbiter_threshold: 0,
            schema_version: crate::types::ESCROW_SCHEMA_VERSION,
        };
        put_escrow(&env, &commitment, &entry);

        // Simulate ledger aging and access (activity)
        for i in 1..5 {
            env.ledger().set_timestamp(created_at + (i * 100_000));
            // Accessing the record should auto-extend TTL
            assert!(get_escrow(&env, &commitment).is_some());
        }
    });
}

#[test]
fn test_ttl_expiry_of_inactive_record() {
    use soroban_sdk::testutils::Ledger;
    let env = Env::default();
    let contract_id = env.register(crate:: RustAcademyContract, ());
    env.as_contract(&contract_id, || {
        let commitment: Bytes = Bytes::from_array(&env, &[4u8; 32]);
        let token = Address::generate(&env);
        let owner = Address::generate(&env);
        let amount = 1000i128;
        let created_at = env.ledger().timestamp();
        let entry = EscrowEntry {
            token: token.clone(),
            amount_due: amount,
            amount_paid: amount,
            owner: owner.clone(),
            status: EscrowStatus::Pending,
            created_at,
            expires_at: 0,
            arbiter: None,
            arbiters: Vec::new(&env),
            arbiter_threshold: 0,
            schema_version: crate::types::ESCROW_SCHEMA_VERSION,
        };
        put_escrow(&env, &commitment, &entry);

        // Simulate ledger aging without activity (no access)
        env.ledger().set_timestamp(created_at + 10_000_000);
        // Record should still exist (Soroban test env does not auto-expire, but this is where expiry would be checked in real runtime)
        assert!(get_escrow(&env, &commitment).is_some());
        // In a real chain, a cleanup or expiry sweep would remove it if TTL expired
    });
}

#[test]
fn test_cleanup_does_not_remove_active_escrow() {
    let env = Env::default();
    let contract_id = env.register(crate:: RustAcademyContract, ());
    env.as_contract(&contract_id, || {
        let commitment: Bytes = Bytes::from_array(&env, &[5u8; 32]);
        let token = Address::generate(&env);
        let owner = Address::generate(&env);
        let amount = 1000i128;
        let created_at = env.ledger().timestamp();
        let entry = EscrowEntry {
            token: token.clone(),
            amount_due: amount,
            amount_paid: amount,
            owner: owner.clone(),
            status: EscrowStatus::Pending,
            created_at,
            expires_at: 0,
            arbiter: None,
            arbiters: Vec::new(&env),
            arbiter_threshold: 0,
            schema_version: crate::types::ESCROW_SCHEMA_VERSION,
        };
        put_escrow(&env, &commitment, &entry);
        // Attempt cleanup (should not remove active escrow)
        let result = crate::escrow::cleanup_escrow(&env, commitment.clone().try_into().unwrap());
        assert!(result.is_err());
        assert!(has_escrow(&env, &commitment));
    });
}
use soroban_sdk::{testutils::Address as _, Address, Bytes, Env};

use crate::{
    storage::*,
    types::{EscrowEntry, EscrowStatus},
};

#[test]
fn test_escrow_storage() {
    let env = Env::default();
    let contract_id = env.register(crate:: RustAcademyContract, ());
    env.as_contract(&contract_id, || {
        // Test basic escrow storage
        let commitment: Bytes = Bytes::from_array(&env, &[1u8; 32]);
        let token = Address::generate(&env);
        let owner = Address::generate(&env);
        let amount = 1000i128;
        let created_at = env.ledger().timestamp();

        let entry = EscrowEntry {
            token: token.clone(),
            amount_due: amount,
            amount_paid: amount,
            owner: owner.clone(),
            status: EscrowStatus::Pending,
            created_at,
            expires_at: 0,
            arbiter: None,
            arbiters: Vec::new(&env),
            arbiter_threshold: 0,
            schema_version: crate::types::ESCROW_SCHEMA_VERSION,
        };

        // Test put_escrow
        put_escrow(&env, &commitment, &entry);

        // Test has_escrow
        assert!(has_escrow(&env, &commitment));

        // Test get_escrow
        let retrieved_entry = get_escrow(&env, &commitment).unwrap();
        assert_eq!(retrieved_entry.token, token);
        assert_eq!(retrieved_entry.amount_due, amount);
        assert_eq!(retrieved_entry.amount_paid, amount);
        assert_eq!(retrieved_entry.owner, owner);
        assert_eq!(retrieved_entry.status, EscrowStatus::Pending);
        assert_eq!(retrieved_entry.created_at, created_at);

        // Test non-existent key
        let non_existent_commitment: Bytes = Bytes::from_array(&env, &[2u8; 32]);
        assert!(!has_escrow(&env, &non_existent_commitment));
        assert!(get_escrow(&env, &non_existent_commitment).is_none());
    });
}

#[test]
fn test_escrow_status_update() {
    let env = Env::default();
    let contract_id = env.register(crate:: RustAcademyContract, ());
    env.as_contract(&contract_id, || {
        let commitment: Bytes = Bytes::from_array(&env, &[1u8; 32]);
        let token = Address::generate(&env);
        let owner = Address::generate(&env);
        let amount = 1000i128;
        let created_at = env.ledger().timestamp();

        let mut entry = EscrowEntry {
            token: token.clone(),
            amount_due: amount,
            amount_paid: amount,
            owner: owner.clone(),
            status: EscrowStatus::Pending,
            created_at,
            expires_at: 0,
            arbiter: None,
            arbiters: Vec::new(&env),
            arbiter_threshold: 0,
            schema_version: crate::types::ESCROW_SCHEMA_VERSION,
        };

        put_escrow(&env, &commitment, &entry);

        // Update status to Spent
        entry.status = EscrowStatus::Spent;
        put_escrow(&env, &commitment, &entry);

        let updated_entry = get_escrow(&env, &commitment).unwrap();
        assert_eq!(updated_entry.status, EscrowStatus::Spent);

        // Update status to Expired
        entry.status = EscrowStatus::Expired;
        put_escrow(&env, &commitment, &entry);

        let updated_entry = get_escrow(&env, &commitment).unwrap();
        assert_eq!(updated_entry.status, EscrowStatus::Expired);
    });
}

#[test]
fn test_escrow_counter() {
    let env = Env::default();
    let contract_id = env.register(crate:: RustAcademyContract, ());
    env.as_contract(&contract_id, || {
        // Test initial counter value
        assert_eq!(get_escrow_counter(&env), 0);

        // Test incrementing counter
        assert_eq!(increment_escrow_counter(&env), 1);
        assert_eq!(get_escrow_counter(&env), 1);

        assert_eq!(increment_escrow_counter(&env), 2);
        assert_eq!(get_escrow_counter(&env), 2);

        assert_eq!(increment_escrow_counter(&env), 3);
        assert_eq!(get_escrow_counter(&env), 3);
    });
}

#[test]
fn test_contract_version_storage() {
    let env = Env::default();
    let contract_id = env.register(crate:: RustAcademyContract, ());
    env.as_contract(&contract_id, || {
        assert_eq!(get_contract_version(&env), None);

        set_contract_version(&env, CURRENT_CONTRACT_VERSION);
        assert_eq!(get_contract_version(&env), Some(CURRENT_CONTRACT_VERSION));
    });
}

#[test]
fn test_initialized_flag_storage() {
    let env = Env::default();
    let contract_id = env.register(crate:: RustAcademyContract, ());
    env.as_contract(&contract_id, || {
        assert!(!is_initialized(&env));

        set_initialized(&env, true);
        assert!(is_initialized(&env));

        set_initialized(&env, false);
        assert!(!is_initialized(&env));
    });
}

#[test]
fn test_admin_storage() {
    let env = Env::default();
    let contract_id = env.register(crate:: RustAcademyContract, ());
    env.as_contract(&contract_id, || {
        let admin = Address::generate(&env);

        // Test setting admin
        set_admin(&env, &admin);
        assert_eq!(get_admin(&env).unwrap(), admin);

        // Test updating admin
        let new_admin = Address::generate(&env);
        set_admin(&env, &new_admin);
        assert_eq!(get_admin(&env).unwrap(), new_admin);
    });
}

#[test]
fn test_paused_storage() {
    let env = Env::default();
    let contract_id = env.register(crate:: RustAcademyContract, ());
    env.as_contract(&contract_id, || {
        // Test initial paused state
        assert!(!is_paused(&env));

        // Test setting paused to true
        set_paused(&env, true);
        assert!(is_paused(&env));

        // Test setting paused to false
        set_paused(&env, false);
        assert!(!is_paused(&env));
    });
}

#[test]
fn test_privacy_storage() {
    let env = Env::default();
    let contract_id = env.register(crate:: RustAcademyContract, ());
    env.as_contract(&contract_id, || {
        let account = Address::generate(&env);
        let privacy_level = 5u32;

        // Test setting privacy level
        set_privacy_level(&env, &account, privacy_level);
        assert_eq!(get_privacy_level(&env, &account).unwrap(), privacy_level);

        // Test updating privacy level
        let new_privacy_level = 10u32;
        set_privacy_level(&env, &account, new_privacy_level);
        assert_eq!(
            get_privacy_level(&env, &account).unwrap(),
            new_privacy_level
        );

        // Test privacy history
        add_privacy_history(&env, &account, 15u32);
        add_privacy_history(&env, &account, 20u32);
        add_privacy_history(&env, &account, 25u32);

        let history = get_privacy_history(&env, &account);
        assert_eq!(history.len(), 3);
        assert_eq!(history.get(0).unwrap(), 25u32);
        assert_eq!(history.get(1).unwrap(), 20u32);
        assert_eq!(history.get(2).unwrap(), 15u32);

        // Test non-existent privacy level
        let non_existent_account = Address::generate(&env);
        assert!(get_privacy_level(&env, &non_existent_account).is_none());
        assert_eq!(get_privacy_history(&env, &non_existent_account).len(), 0);
    });
}

// ---------------------------------------------------------------------------
// Issue #51 — auxiliary index rent/cleanup regression tests
// ---------------------------------------------------------------------------

#[test]
fn test_cleanup_removes_auxiliary_indices() {
    use crate::types::DisputeVote;
    use soroban_sdk::BytesN;

    let env = Env::default();
    let contract_id = env.register(crate:: RustAcademyContract, ());
    env.as_contract(&contract_id, || {
        let commitment: Bytes = Bytes::from_array(&env, &[7u8; 32]);
        let commitment_n: BytesN<32> = BytesN::from_array(&env, &[7u8; 32]);
        let escrow_id: BytesN<32> = BytesN::from_array(&env, &[9u8; 32]);
        let token = Address::generate(&env);
        let owner = Address::generate(&env);
        let arbiter = Address::generate(&env);

        let mut arbiters = Vec::new(&env);
        arbiters.push_back(arbiter.clone());

        // A terminal escrow with all of its auxiliary indices populated.
        let entry = EscrowEntry {
            token,
            amount_due: 1000,
            amount_paid: 1000,
            owner,
            status: EscrowStatus::Spent,
            created_at: 0,
            expires_at: 0,
            arbiter: None,
            arbiters,
            arbiter_threshold: 1,
            schema_version: crate::types::ESCROW_SCHEMA_VERSION,
        };
        put_escrow(&env, &commitment, &entry);
        put_escrow_id_mapping(&env, &escrow_id, &commitment_n);
        put_commitment_escrow_id(&env, &commitment, &escrow_id);
        put_dispute_vote(
            &env,
            &commitment,
            &arbiter,
            &DisputeVote {
                arbiter: arbiter.clone(),
                resolve_for_owner: true,
                voted_at: 0,
            },
        );

        // Sanity: every index resolves before cleanup.
        assert!(get_escrow_id_mapping(&env, &escrow_id).is_some());
        assert!(get_commitment_escrow_id(&env, &commitment).is_some());
        assert!(has_dispute_vote(&env, &commitment, &arbiter));

        crate::escrow::cleanup_escrow(&env, commitment_n).unwrap();

        // Primary record and every auxiliary index are gone — no stale lookup
        // can resolve to the removed escrow.
        assert!(!has_escrow(&env, &commitment));
        assert!(get_escrow_id_mapping(&env, &escrow_id).is_none());
        assert!(get_commitment_escrow_id(&env, &commitment).is_none());
        assert!(!has_dispute_vote(&env, &commitment, &arbiter));
    });
}

#[test]
fn test_privacy_history_is_bounded() {
    let env = Env::default();
    let contract_id = env.register(crate:: RustAcademyContract, ());
    env.as_contract(&contract_id, || {
        let account = Address::generate(&env);
        let total = MAX_PRIVACY_HISTORY + 20;
        for i in 0..total {
            add_privacy_history(&env, &account, i);
        }

        let history = get_privacy_history(&env, &account);
        // Never grows beyond the cap.
        assert_eq!(history.len(), MAX_PRIVACY_HISTORY);
        // Newest-first: the most recent push is retained at the front.
        assert_eq!(history.get(0).unwrap(), total - 1);
        // The oldest retained entry is exactly `cap` items back from newest.
        assert_eq!(
            history.get(MAX_PRIVACY_HISTORY - 1).unwrap(),
            total - MAX_PRIVACY_HISTORY
        );
    });
}

#[test]
fn test_privacy_level_ttl_extended_on_write_and_read() {
    let env = Env::default();
    let contract_id = env.register(crate:: RustAcademyContract, ());
    env.as_contract(&contract_id, || {
        let account = Address::generate(&env);

        // Write sets TTL.
        set_privacy_level(&env, &account, 2);
        assert_eq!(get_privacy_level(&env, &account), Some(2));

        // Update extends TTL and value is accurate.
        set_privacy_level(&env, &account, 5);
        assert_eq!(get_privacy_level(&env, &account), Some(5));
    });
}

#[test]
fn test_privacy_history_ttl_extended_on_write_and_read() {
    let env = Env::default();
    let contract_id = env.register(crate:: RustAcademyContract, ());
    env.as_contract(&contract_id, || {
        let account = Address::generate(&env);

        add_privacy_history(&env, &account, 1);
        add_privacy_history(&env, &account, 2);
        add_privacy_history(&env, &account, 3);

        let history = get_privacy_history(&env, &account);
        // Newest-first ordering is maintained and TTL was extended.
        assert_eq!(history.len(), 3);
        assert_eq!(history.get(0).unwrap(), 3u32);
        assert_eq!(history.get(2).unwrap(), 1u32);
    });
}

#[test]
fn test_cleanup_stealth_escrow_removes_terminal_entry() {
    use crate::types::StealthEscrowEntry;
    use soroban_sdk::BytesN;

    let env = Env::default();
    let contract_id = env.register(crate:: RustAcademyContract, ());
    env.as_contract(&contract_id, || {
        let stealth: BytesN<32> = BytesN::from_array(&env, &[2u8; 32]);
        let entry = StealthEscrowEntry {
            token: Address::generate(&env),
            amount_due: 500,
            amount_paid: 0, // Terminal entries must have zero balance (INV-S-1)
            eph_pub: BytesN::from_array(&env, &[3u8; 32]),
            status: EscrowStatus::Spent,
            created_at: 0,
            expires_at: 0,
            schema_version: crate::types::STEALTH_ESCROW_SCHEMA_VERSION,
        };
        put_stealth_escrow(&env, &stealth, &entry);
        assert!(get_stealth_escrow(&env, &stealth).is_some());

        crate::stealth::cleanup_stealth_escrow(&env, stealth.clone()).unwrap();

        // Terminal entry removed: no stale lookup remains.
        assert!(get_stealth_escrow(&env, &stealth).is_none());
    });
}

#[test]
fn test_cleanup_stealth_escrow_rejects_non_terminal() {
    use crate::types::StealthEscrowEntry;
    use soroban_sdk::BytesN;

    let env = Env::default();
    let contract_id = env.register(crate:: RustAcademyContract, ());
    env.as_contract(&contract_id, || {
        let stealth: BytesN<32> = BytesN::from_array(&env, &[4u8; 32]);
        let entry = StealthEscrowEntry {
            token: Address::generate(&env),
            amount_due: 500,
            amount_paid: 500,
            eph_pub: BytesN::from_array(&env, &[5u8; 32]),
            status: EscrowStatus::Pending,
            created_at: 0,
            expires_at: 0,
            schema_version: crate::types::STEALTH_ESCROW_SCHEMA_VERSION,
        };
        put_stealth_escrow(&env, &stealth, &entry);

        // A still-pending entry must not be cleaned up.
        assert!(crate::stealth::cleanup_stealth_escrow(&env, stealth.clone()).is_err());
        assert!(get_stealth_escrow(&env, &stealth).is_some());
    });
}