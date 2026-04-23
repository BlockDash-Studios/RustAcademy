//! Tests for the batch_withdraw and batch_refund entry points.
//!
//! Coverage:
//! - Full-success batch (all items pass)
//! - Mixed batch (some pass, some fail with known errors)
//! - Boundary: exactly MAX_BATCH_SIZE items (accepted)
//! - Boundary: MAX_BATCH_SIZE + 1 items (rejected with BatchTooLarge)
//! - Whole-call guard: contract paused
//! - Whole-call guard: feature paused
//! - Backward-compat: single-item entry points still work alongside batch

use soroban_sdk::{testutils::Address as _, token, Address, Bytes, BytesN, Env, Vec};

use crate::{
    batch::MAX_BATCH_SIZE,
    errors::QuickexError,
    storage::PauseFlag,
    types::{BatchItemResult, BatchRefundParams, BatchWithdrawParams},
    QuickexContract, QuickexContractClient,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn setup<'a>() -> (Env, QuickexContractClient<'a>) {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(QuickexContract, ());
    let client = QuickexContractClient::new(&env, &id);
    (env, client)
}

fn create_token(env: &Env) -> Address {
    env.register_stellar_asset_contract_v2(Address::generate(env))
        .address()
}

fn mint(env: &Env, token: &Address, to: &Address, amount: i128) {
    token::StellarAssetClient::new(env, token).mint(to, &amount);
}

/// Deposit a fresh escrow and return its commitment hash.
fn deposit_escrow(
    env: &Env,
    client: &QuickexContractClient,
    token: &Address,
    owner: &Address,
    amount: i128,
    salt: &[u8],
) -> BytesN<32> {
    mint(env, token, owner, amount);
    client.deposit(
        token,
        &amount,
        owner,
        &Bytes::from_slice(env, salt),
        &0,
        &None,
    )
}

/// Deposit an escrow that expires after `timeout_secs`.
fn deposit_expiring(
    env: &Env,
    client: &QuickexContractClient,
    token: &Address,
    owner: &Address,
    amount: i128,
    salt: &[u8],
    timeout_secs: u64,
) -> BytesN<32> {
    mint(env, token, owner, amount);
    client.deposit(
        token,
        &amount,
        owner,
        &Bytes::from_slice(env, salt),
        &timeout_secs,
        &None,
    )
}

fn assert_contract_error<T>(
    result: Result<
        Result<T, soroban_sdk::ConversionError>,
        Result<QuickexError, soroban_sdk::InvokeError>,
    >,
    expected: QuickexError,
) {
    match result {
        Err(Ok(actual)) => assert_eq!(actual, expected),
        _ => panic!("expected contract error {:?}", expected),
    }
}

// ---------------------------------------------------------------------------
// batch_withdraw tests
// ---------------------------------------------------------------------------

/// All items in the batch succeed.
#[test]
fn test_batch_withdraw_full_success() {
    let (env, client) = setup();
    let token = create_token(&env);

    // Prepare 3 escrows
    let users: [(Address, i128, &[u8]); 3] = [
        (Address::generate(&env), 100, b"bw_salt_1"),
        (Address::generate(&env), 200, b"bw_salt_2"),
        (Address::generate(&env), 300, b"bw_salt_3"),
    ];

    let mut items: Vec<BatchWithdrawParams> = Vec::new(&env);
    for (owner, amount, salt_bytes) in &users {
        let commitment = deposit_escrow(&env, &client, &token, owner, *amount, salt_bytes);
        // Fund the contract so it can pay out
        mint(&env, &token, &client.address, *amount);
        items.push_back(BatchWithdrawParams {
            amount: *amount,
            commitment,
            to: owner.clone(),
            salt: Bytes::from_slice(&env, salt_bytes),
        });
    }

    let results = client.batch_withdraw(&items);

    assert_eq!(results.len(), 3);
    for i in 0..results.len() {
        assert_eq!(results.get(i).unwrap(), BatchItemResult::Ok);
    }
}

/// 3 items succeed, 2 fail (already spent / not found).
#[test]
fn test_batch_withdraw_mixed_success_failure() {
    let (env, client) = setup();
    let token = create_token(&env);

    // 3 valid escrows
    let valid_users: [(Address, i128, &[u8]); 3] = [
        (Address::generate(&env), 100, b"mix_ok_1"),
        (Address::generate(&env), 200, b"mix_ok_2"),
        (Address::generate(&env), 300, b"mix_ok_3"),
    ];

    let mut items: Vec<BatchWithdrawParams> = Vec::new(&env);

    for (owner, amount, salt_bytes) in &valid_users {
        let commitment = deposit_escrow(&env, &client, &token, owner, *amount, salt_bytes);
        mint(&env, &token, &client.address, *amount);
        items.push_back(BatchWithdrawParams {
            amount: *amount,
            commitment,
            to: owner.clone(),
            salt: Bytes::from_slice(&env, salt_bytes),
        });
    }

    // 2 invalid items: non-existent commitments
    let ghost1 = Address::generate(&env);
    let ghost2 = Address::generate(&env);
    items.push_back(BatchWithdrawParams {
        amount: 999,
        commitment: BytesN::from_array(&env, &[0xAA; 32]),
        to: ghost1,
        salt: Bytes::from_slice(&env, b"ghost_salt_1"),
    });
    items.push_back(BatchWithdrawParams {
        amount: 888,
        commitment: BytesN::from_array(&env, &[0xBB; 32]),
        to: ghost2,
        salt: Bytes::from_slice(&env, b"ghost_salt_2"),
    });

    let results = client.batch_withdraw(&items);

    assert_eq!(results.len(), 5);
    // First 3 succeed
    for i in 0..3 {
        assert_eq!(results.get(i).unwrap(), BatchItemResult::Ok, "item {i} should succeed");
    }
    // Last 2 fail with CommitmentNotFound
    for i in 3..5 {
        assert_eq!(
            results.get(i).unwrap(),
            BatchItemResult::Err(QuickexError::CommitmentNotFound as u32),
            "item {i} should fail with CommitmentNotFound"
        );
    }
}

/// Batch of exactly MAX_BATCH_SIZE items is accepted.
#[test]
fn test_batch_withdraw_at_max_size() {
    let (env, client) = setup();
    let token = create_token(&env);

    let mut items: Vec<BatchWithdrawParams> = Vec::new(&env);
    for i in 0..MAX_BATCH_SIZE {
        let owner = Address::generate(&env);
        let amount: i128 = 100 + i as i128;
        // Use a unique salt per item
        let mut salt_bytes = [0u8; 16];
        salt_bytes[..4].copy_from_slice(&i.to_be_bytes());
        let commitment = deposit_escrow(&env, &client, &token, &owner, amount, &salt_bytes);
        mint(&env, &token, &client.address, amount);
        items.push_back(BatchWithdrawParams {
            amount,
            commitment,
            to: owner,
            salt: Bytes::from_slice(&env, &salt_bytes),
        });
    }

    let results = client.batch_withdraw(&items);
    assert_eq!(results.len(), MAX_BATCH_SIZE);
    for i in 0..results.len() {
        assert_eq!(results.get(i).unwrap(), BatchItemResult::Ok);
    }
}

/// Batch of MAX_BATCH_SIZE + 1 items is rejected with BatchTooLarge.
#[test]
fn test_batch_withdraw_exceeds_max_size() {
    let (env, client) = setup();
    let token = create_token(&env);

    let mut items: Vec<BatchWithdrawParams> = Vec::new(&env);
    for i in 0..=MAX_BATCH_SIZE {
        // Items don't need to be valid — the size check fires first
        items.push_back(BatchWithdrawParams {
            amount: 100,
            commitment: BytesN::from_array(&env, &[i as u8; 32]),
            to: Address::generate(&env),
            salt: Bytes::from_slice(&env, b"overflow"),
        });
    }

    let result = client.try_batch_withdraw(&items);
    assert_contract_error(result, QuickexError::BatchTooLarge);
}

/// batch_withdraw is blocked when the contract is globally paused.
#[test]
fn test_batch_withdraw_blocked_when_paused() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    client.set_paused(&admin, &true);

    let items: Vec<BatchWithdrawParams> = Vec::new(&env);
    let result = client.try_batch_withdraw(&items);
    assert_contract_error(result, QuickexError::ContractPaused);
}

/// batch_withdraw is blocked when the Withdrawal feature is paused.
#[test]
fn test_batch_withdraw_blocked_when_feature_paused() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    client.pause_features(&admin, &(PauseFlag::Withdrawal as u64));

    let items: Vec<BatchWithdrawParams> = Vec::new(&env);
    let result = client.try_batch_withdraw(&items);
    assert_contract_error(result, QuickexError::OperationPaused);
}

// ---------------------------------------------------------------------------
// batch_refund tests
// ---------------------------------------------------------------------------

/// All refund items succeed.
#[test]
fn test_batch_refund_full_success() {
    let (env, client) = setup();
    let token = create_token(&env);
    let timeout: u64 = 100;

    let mut items: Vec<BatchRefundParams> = Vec::new(&env);
    for i in 0u32..3 {
        let owner = Address::generate(&env);
        let amount: i128 = 500 + i as i128;
        let mut salt_bytes = [0u8; 8];
        salt_bytes[..4].copy_from_slice(&i.to_be_bytes());
        let commitment =
            deposit_expiring(&env, &client, &token, &owner, amount, &salt_bytes, timeout);
        items.push_back(BatchRefundParams {
            commitment,
            caller: owner,
        });
    }

    // Advance past expiry
    let now = env.ledger().timestamp();
    env.ledger().set_timestamp(now + timeout + 1);

    // Fund contract so refunds can transfer back
    mint(&env, &token, &client.address, 1500 + 3);

    let results = client.batch_refund(&items);
    assert_eq!(results.len(), 3);
    for i in 0..results.len() {
        assert_eq!(results.get(i).unwrap(), BatchItemResult::Ok);
    }
}

/// 3 refunds succeed, 2 fail (escrow not expired / not found).
#[test]
fn test_batch_refund_mixed_success_failure() {
    let (env, client) = setup();
    let token = create_token(&env);
    let timeout: u64 = 100;

    let mut items: Vec<BatchRefundParams> = Vec::new(&env);

    // 3 valid expiring escrows
    for i in 0u32..3 {
        let owner = Address::generate(&env);
        let amount: i128 = 400 + i as i128;
        let mut salt_bytes = [0u8; 8];
        salt_bytes[..4].copy_from_slice(&i.to_be_bytes());
        let commitment =
            deposit_expiring(&env, &client, &token, &owner, amount, &salt_bytes, timeout);
        items.push_back(BatchRefundParams {
            commitment,
            caller: owner,
        });
    }

    // 1 non-expiring escrow (refund will fail with EscrowNotExpired)
    let owner_ne = Address::generate(&env);
    let commitment_ne =
        deposit_escrow(&env, &client, &token, &owner_ne, 999, b"no_expire_salt");
    items.push_back(BatchRefundParams {
        commitment: commitment_ne,
        caller: owner_ne,
    });

    // 1 non-existent commitment
    items.push_back(BatchRefundParams {
        commitment: BytesN::from_array(&env, &[0xCC; 32]),
        caller: Address::generate(&env),
    });

    // Advance past expiry for the 3 valid ones
    let now = env.ledger().timestamp();
    env.ledger().set_timestamp(now + timeout + 1);

    mint(&env, &token, &client.address, 1200 + 3);

    let results = client.batch_refund(&items);
    assert_eq!(results.len(), 5);

    // First 3 succeed
    for i in 0..3 {
        assert_eq!(results.get(i).unwrap(), BatchItemResult::Ok, "item {i} should succeed");
    }
    // Item 3: non-expiring → EscrowNotExpired
    assert_eq!(
        results.get(3).unwrap(),
        BatchItemResult::Err(QuickexError::EscrowNotExpired as u32)
    );
    // Item 4: not found → CommitmentNotFound
    assert_eq!(
        results.get(4).unwrap(),
        BatchItemResult::Err(QuickexError::CommitmentNotFound as u32)
    );
}

/// Batch of exactly MAX_BATCH_SIZE refund items is accepted.
#[test]
fn test_batch_refund_at_max_size() {
    let (env, client) = setup();
    let token = create_token(&env);
    let timeout: u64 = 50;

    let mut items: Vec<BatchRefundParams> = Vec::new(&env);
    let mut total: i128 = 0;
    for i in 0..MAX_BATCH_SIZE {
        let owner = Address::generate(&env);
        let amount: i128 = 10 + i as i128;
        total += amount;
        let mut salt_bytes = [0u8; 8];
        salt_bytes[..4].copy_from_slice(&i.to_be_bytes());
        let commitment =
            deposit_expiring(&env, &client, &token, &owner, amount, &salt_bytes, timeout);
        items.push_back(BatchRefundParams {
            commitment,
            caller: owner,
        });
    }

    let now = env.ledger().timestamp();
    env.ledger().set_timestamp(now + timeout + 1);
    mint(&env, &token, &client.address, total);

    let results = client.batch_refund(&items);
    assert_eq!(results.len(), MAX_BATCH_SIZE);
    for i in 0..results.len() {
        assert_eq!(results.get(i).unwrap(), BatchItemResult::Ok);
    }
}

/// Batch of MAX_BATCH_SIZE + 1 refund items is rejected with BatchTooLarge.
#[test]
fn test_batch_refund_exceeds_max_size() {
    let (env, client) = setup();

    let mut items: Vec<BatchRefundParams> = Vec::new(&env);
    for i in 0..=MAX_BATCH_SIZE {
        items.push_back(BatchRefundParams {
            commitment: BytesN::from_array(&env, &[i as u8; 32]),
            caller: Address::generate(&env),
        });
    }

    let result = client.try_batch_refund(&items);
    assert_contract_error(result, QuickexError::BatchTooLarge);
}

/// batch_refund is blocked when the contract is globally paused.
#[test]
fn test_batch_refund_blocked_when_paused() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    client.set_paused(&admin, &true);

    let items: Vec<BatchRefundParams> = Vec::new(&env);
    let result = client.try_batch_refund(&items);
    assert_contract_error(result, QuickexError::ContractPaused);
}

/// batch_refund is blocked when the Refund feature is paused.
#[test]
fn test_batch_refund_blocked_when_feature_paused() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    client.pause_features(&admin, &(PauseFlag::Refund as u64));

    let items: Vec<BatchRefundParams> = Vec::new(&env);
    let result = client.try_batch_refund(&items);
    assert_contract_error(result, QuickexError::OperationPaused);
}

// ---------------------------------------------------------------------------
// Backward-compatibility: single-item entry points still work
// ---------------------------------------------------------------------------

/// Existing single-item withdraw still works after batch entry points are added.
#[test]
fn test_single_withdraw_backward_compat() {
    let (env, client) = setup();
    let token = create_token(&env);
    let owner = Address::generate(&env);
    let amount: i128 = 777;
    let salt = Bytes::from_slice(&env, b"compat_salt");

    mint(&env, &token, &owner, amount);
    let commitment = client.deposit(&token, &amount, &owner, &salt, &0, &None);
    mint(&env, &token, &client.address, amount);

    let ok = client.withdraw(&token, &amount, &commitment, &owner, &salt);
    assert!(ok);
}

/// Existing single-item refund still works after batch entry points are added.
#[test]
fn test_single_refund_backward_compat() {
    let (env, client) = setup();
    let token = create_token(&env);
    let owner = Address::generate(&env);
    let amount: i128 = 555;
    let timeout: u64 = 60;
    let salt = Bytes::from_slice(&env, b"compat_refund_salt");

    mint(&env, &token, &owner, amount);
    let commitment = client.deposit(&token, &amount, &owner, &salt, &timeout, &None);

    let now = env.ledger().timestamp();
    env.ledger().set_timestamp(now + timeout + 1);

    client.refund(&commitment, &owner);
}
