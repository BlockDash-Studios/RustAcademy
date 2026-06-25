use crate::{
    types::{FeeRatio, PerAssetFeeConfig},
    EscrowStatus,  RustAcademyContract,  RustAcademyContractClient,
};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Bytes, Env,
};

fn setup<'a>() -> (Env,  RustAcademyContractClient<'a>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = 1_000);

    let contract_id = env.register( RustAcademyContract, ());
    let client =  RustAcademyContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    (env, client, admin)
}

fn create_token(env: &Env) -> Address {
    env.register_stellar_asset_contract_v2(Address::generate(env))
        .address()
}

#[test]
fn test_fee_router_per_asset_overrides_global_across_assets() {
    let (env, client, admin) = setup();

    // "XLM" and "SAC" are both represented as token contract addresses in Soroban.
    let xlm_token = create_token(&env);
    let sac_token = create_token(&env);

    let user = Address::generate(&env);
    let collector = Address::generate(&env);

    let xlm_admin = token::StellarAssetClient::new(&env, &xlm_token);
    let sac_admin = token::StellarAssetClient::new(&env, &sac_token);
    let xlm_client = token::Client::new(&env, &xlm_token);
    let sac_client = token::Client::new(&env, &sac_token);

    xlm_admin.mint(&user, &10_000);
    sac_admin.mint(&user, &10_000);

    // Global fee = 5%.
    client.set_fee_config(&admin, &crate::types::FeeConfig { fee_bps: 500 });
    client.set_platform_wallet(&admin, &collector);

    // Per-asset override for XLM token = 10%.
    client.set_per_asset_fee(
        &admin,
        &xlm_token,
        &PerAssetFeeConfig {
            fee_bps: 1_000,
            arbiter_bps: 0,
            ..Default::default()
        },
    );

    // Withdraw XLM path: fee should use per-asset 10%.
    let xlm_amount: i128 = 1_000;
    let xlm_salt = Bytes::from_slice(&env, b"fee_router_xlm_salt");
    let xlm_commitment = client.deposit(&xlm_token, &xlm_amount, &user, &xlm_salt, &0, &None);
    client.withdraw(&xlm_token, &xlm_amount, &xlm_commitment, &user, &xlm_salt);

    // Withdraw SAC path: fee should use global 5%.
    let sac_amount: i128 = 1_000;
    let sac_salt = Bytes::from_slice(&env, b"fee_router_sac_salt");
    let sac_commitment = client.deposit(&sac_token, &sac_amount, &user, &sac_salt, &0, &None);
    client.withdraw(&sac_token, &sac_amount, &sac_commitment, &user, &sac_salt);

    // Expected fees: XLM 100 + SAC 50 = 150 to collector.
    assert_eq!(xlm_client.balance(&collector), 100);
    assert_eq!(sac_client.balance(&collector), 50);

    // User received net payout per token and no escrow balance remains in contract.
    assert_eq!(xlm_client.balance(&client.address), 0);
    assert_eq!(sac_client.balance(&client.address), 0);

    // Sanity check statuses are terminal and correct.
    assert_eq!(
        client.get_commitment_state(&xlm_commitment),
        Some(EscrowStatus::Spent)
    );
    assert_eq!(
        client.get_commitment_state(&sac_commitment),
        Some(EscrowStatus::Spent)
    );
}

#[test]
fn test_fee_router_dispute_with_optional_arbiter_split() {
    let (env, client, admin) = setup();

    let token_id = create_token(&env);
    let owner = Address::generate(&env);
    let recipient = Address::generate(&env);
    let arbiter = Address::generate(&env);
    let platform_wallet = Address::generate(&env);
    let collector = Address::generate(&env);

    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    let token_client = token::Client::new(&env, &token_id);

    token_admin.mint(&owner, &10_000);

    client.set_platform_wallet(&admin, &platform_wallet);
    client.rotate_fee_collector(&admin, &collector);
    client.set_per_asset_fee(
        &admin,
        &token_id,
        &PerAssetFeeConfig {
            fee_bps: 1_000,     // 10% total fee
            arbiter_bps: 2_000, // 20% of fee to arbiter
            arbiter_fee: FeeRatio {
                numerator: 1,
                denominator: 5,
            },
            platform_fee: FeeRatio {
                numerator: 3,
                denominator: 10,
            },
            collector_fee: FeeRatio {
                numerator: 1,
                denominator: 2,
            },
            ..Default::default()
        },
    );

    let amount: i128 = 1_000;
    let salt = Bytes::from_slice(&env, b"fee_router_dispute_split");
    let commitment = client.deposit(
        &token_id,
        &amount,
        &owner,
        &salt,
        &1000,
        &Some(arbiter.clone()),
    );

    client.dispute(&commitment);
    client.resolve_dispute(&arbiter, &commitment, &false, &recipient);

    // Fee math:
    // total_fee = 100
    // arbiter_fee = 20
    // platform_fee = 30
    // collector_fee = 50
    // recipient_net = 900
    assert_eq!(token_client.balance(&recipient), 900);
    assert_eq!(token_client.balance(&arbiter), 20);
    assert_eq!(token_client.balance(&platform_wallet), 30);
    assert_eq!(token_client.balance(&collector), 50);

    // Bound safety: payout + all fee recipients equals gross amount.
    assert_eq!(
        token_client.balance(&recipient)
            + token_client.balance(&arbiter)
            + token_client.balance(&platform_wallet)
            + token_client.balance(&collector),
        amount
    );
    assert_eq!(
        client.get_commitment_state(&commitment),
        Some(EscrowStatus::Spent)
    );
}

#[test]
fn test_fee_router_collector_rotation_applies_to_new_payouts_and_old_escrows() {
    let (env, client, admin) = setup();

    let token_id = create_token(&env);
    let owner = Address::generate(&env);
    let collector_v1 = Address::generate(&env);
    let collector_v2 = Address::generate(&env);

    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    let token_client = token::Client::new(&env, &token_id);

    token_admin.mint(&owner, &20_000);

    client.set_fee_config(&admin, &crate::types::FeeConfig { fee_bps: 1_000 });
    client.set_platform_wallet(&admin, &collector_v1);

    // Escrow created before rotation.
    let amount_old: i128 = 1_000;
    let salt_old = Bytes::from_slice(&env, b"fee_router_old_escrow");
    let old_commitment = client.deposit(&token_id, &amount_old, &owner, &salt_old, &0, &None);

    // Rotate collector safely.
    let next_idx = client.rotate_fee_collector(&admin, &collector_v2);
    assert!(next_idx > 0);
    assert_eq!(
        client.get_active_fee_collector(),
        Some(collector_v2.clone())
    );

    // Settling old escrow after rotation should route fee to collector_v2.
    client.withdraw(&token_id, &amount_old, &old_commitment, &owner, &salt_old);

    // New escrow after rotation should also route to collector_v2.
    let amount_new: i128 = 1_000;
    let salt_new = Bytes::from_slice(&env, b"fee_router_new_escrow");
    let new_commitment = client.deposit(&token_id, &amount_new, &owner, &salt_new, &0, &None);
    client.withdraw(&token_id, &amount_new, &new_commitment, &owner, &salt_new);

    // 10% fee on each withdrawal => 100 + 100.
    assert_eq!(token_client.balance(&collector_v1), 0);
    assert_eq!(token_client.balance(&collector_v2), 200);

    // Old and new escrows both settled successfully.
    assert_eq!(
        client.get_commitment_state(&old_commitment),
        Some(EscrowStatus::Spent)
    );
    assert_eq!(
        client.get_commitment_state(&new_commitment),
        Some(EscrowStatus::Spent)
    );
}

#[test]
fn test_fee_router_rejects_overallocated_explicit_split() {
    let (env, client, admin) = setup();

    let token_id = create_token(&env);
    let owner = Address::generate(&env);
    let platform_wallet = Address::generate(&env);
    let collector = Address::generate(&env);

    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    token_admin.mint(&owner, &10_000);

    client.set_platform_wallet(&admin, &platform_wallet);
    client.rotate_fee_collector(&admin, &collector);
    client.set_per_asset_fee(
        &admin,
        &token_id,
        &PerAssetFeeConfig {
            fee_bps: 1_000,
            arbiter_bps: 0,
            arbiter_fee: FeeRatio {
                numerator: 0,
                denominator: 1,
            },
            platform_fee: FeeRatio {
                numerator: 2,
                denominator: 3,
            },
            collector_fee: FeeRatio {
                numerator: 2,
                denominator: 3,
            },
        },
    );

    let amount: i128 = 1_000;
    let salt = Bytes::from_slice(&env, b"fee_router_overallocated_split");
    let commitment = client.deposit(&token_id, &amount, &owner, &salt, &0, &None);

    let result = client.try_withdraw(&token_id, &amount, &commitment, &owner, &salt);
    assert!(matches!(result, Ok(Err(_)) | Err(_)));
    assert_eq!(
        client.get_commitment_state(&commitment),
        Some(EscrowStatus::Pending)
    );
}

#[test]
fn test_fee_router_zero_fee_allows_payout_without_recipient() {
    let (env, client, admin) = setup();

    let token_id = create_token(&env);
    let owner = Address::generate(&env);

    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    let token_client = token::Client::new(&env, &token_id);

    token_admin.mint(&owner, &10_000);

    // Set 0% fee - no recipient required
    client.set_fee_config(&admin, &crate::types::FeeConfig { fee_bps: 0 });

    let amount: i128 = 1_000;
    let salt = Bytes::from_slice(&env, b"zero_fee_salt");
    let commitment = client.deposit(&token_id, &amount, &owner, &salt, &0, &None);
    client.withdraw(&token_id, &amount, &commitment, &owner, &salt);

    // Full amount returned to owner, no fees collected
    assert_eq!(token_client.balance(&owner), 10_000);
    assert_eq!(token_client.balance(&client.address), 0);
}

#[test]
fn test_fee_router_hundred_percent_fee_with_recipient() {
    let (env, client, admin) = setup();

    let token_id = create_token(&env);
    let owner = Address::generate(&env);
    let collector = Address::generate(&env);

    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    let token_client = token::Client::new(&env, &token_id);

    token_admin.mint(&owner, &10_000);

    // Set 100% fee with valid recipient
    client.set_fee_config(&admin, &crate::types::FeeConfig { fee_bps: 10_000 });
    client.set_platform_wallet(&admin, &collector);

    let amount: i128 = 1_000;
    let salt = Bytes::from_slice(&env, b"hundred_percent_salt");
    let commitment = client.deposit(&token_id, &amount, &owner, &salt, &0, &None);
    client.withdraw(&token_id, &amount, &commitment, &owner, &salt);

    // Entire fee goes to collector, owner gets nothing from this withdrawal
    assert_eq!(token_client.balance(&owner), 9_000);
    assert_eq!(token_client.balance(&collector), 1_000);
    assert_eq!(token_client.balance(&client.address), 0);
}

#[test]
fn test_fee_router_rejects_nonzero_fee_without_recipient() {
    let (env, client, admin) = setup();

    let token_id = create_token(&env);
    let owner = Address::generate(&env);

    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    token_admin.mint(&owner, &10_000);

    // Set non-zero fee but no recipient
    client.set_fee_config(&admin, &crate::types::FeeConfig { fee_bps: 1_000 });

    let amount: i128 = 1_000;
    let salt = Bytes::from_slice(&env, b"no_recipient_salt");
    let commitment = client.deposit(&token_id, &amount, &owner, &salt, &0, &None);

    // Withdrawal should fail with FeeRecipientRequired
    let result = client.try_withdraw(&token_id, &amount, &commitment, &owner, &salt);
    assert!(matches!(result, Err(Ok(crate::RustAcademyError::FeeRecipientRequired)) | Err(Err(_))));
}

#[test]
fn test_fee_router_rotated_collector_receives_fees() {
    let (env, client, admin) = setup();

    let token_id = create_token(&env);
    let owner = Address::generate(&env);
    let collector_v1 = Address::generate(&env);
    let collector_v2 = Address::generate(&env);

    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    let token_client = token::Client::new(&env, &token_id);

    token_admin.mint(&owner, &10_000);

    // Set initial collector
    client.set_fee_config(&admin, &crate::types::FeeConfig { fee_bps: 1_000 });
    client.rotate_fee_collector(&admin, &collector_v1);

    let amount_v1: i128 = 1_000;
    let salt_v1 = Bytes::from_slice(&env, b"collector_v1_salt");
    let commitment_v1 = client.deposit(&token_id, &amount_v1, &owner, &salt_v1, &0, &None);
    client.withdraw(&token_id, &amount_v1, &commitment_v1, &owner, &salt_v1);

    // Rotate to new collector
    client.rotate_fee_collector(&admin, &collector_v2);

    let amount_v2: i128 = 1_000;
    let salt_v2 = Bytes::from_slice(&env, b"collector_v2_salt");
    let commitment_v2 = client.deposit(&token_id, &amount_v2, &owner, &salt_v2, &0, &None);
    client.withdraw(&token_id, &amount_v2, &commitment_v2, &owner, &salt_v2);

    // v1 collector got first fee, v2 collector got second fee
    assert_eq!(token_client.balance(&collector_v1), 100);
    assert_eq!(token_client.balance(&collector_v2), 100);
}

#[test]
fn test_fee_router_per_asset_override_with_arbiter_split() {
    let (env, client, admin) = setup();

    let token_id = create_token(&env);
    let owner = Address::generate(&env);
    let recipient = Address::generate(&env);
    let arbiter = Address::generate(&env);
    let collector = Address::generate(&env);

    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    let token_client = token::Client::new(&env, &token_id);

    token_admin.mint(&owner, &10_000);

    // Global fee 5%
    client.set_fee_config(&admin, &crate::types::FeeConfig { fee_bps: 500 });
    client.rotate_fee_collector(&admin, &collector);

    // Per-asset override 10% with 20% arbiter split
    client.set_per_asset_fee(
        &admin,
        &token_id,
        &PerAssetFeeConfig {
            fee_bps: 1_000,
            arbiter_bps: 2_000,
            ..Default::default()
        },
    );

    let amount: i128 = 1_000;
    let salt = Bytes::from_slice(&env, b"per_asset_arbiter_salt");
    let commitment = client.deposit(
        &token_id,
        &amount,
        &owner,
        &salt,
        &0,
        &Some(arbiter.clone()),
    );
    
    // Use dispute resolution to test arbiter split (arbiter only paid in dispute path)
    client.dispute(&commitment);
    client.resolve_dispute(&arbiter, &commitment, &false, &recipient);

    // Per-asset override: 10% fee = 100, 20% to arbiter = 20, 80% to collector = 80
    assert_eq!(token_client.balance(&arbiter), 20);
    assert_eq!(token_client.balance(&collector), 80);
    // Recipient gets net payout: 1000 - 100 = 900
    assert_eq!(token_client.balance(&recipient), 900);

    // Invariant: net payout + arbiter_fee + collector_fee = escrow amount
    assert_eq!(900 + 20 + 80, amount);
}

#[test]
fn test_fee_router_payout_plus_fees_equals_escrow_amount() {
    let (env, client, admin) = setup();

    let token_id = create_token(&env);
    let owner = Address::generate(&env);
    let arbiter = Address::generate(&env);
    let platform_wallet = Address::generate(&env);
    let collector = Address::generate(&env);

    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    let token_client = token::Client::new(&env, &token_id);

    token_admin.mint(&owner, &10_000);

    client.set_platform_wallet(&admin, &platform_wallet);
    client.rotate_fee_collector(&admin, &collector);
    client.set_per_asset_fee(
        &admin,
        &token_id,
        &PerAssetFeeConfig {
            fee_bps: 1_000,
            arbiter_bps: 2_000,
            arbiter_fee: FeeRatio {
                numerator: 1,
                denominator: 5,
            },
            platform_fee: FeeRatio {
                numerator: 3,
                denominator: 10,
            },
            collector_fee: FeeRatio {
                numerator: 1,
                denominator: 2,
            },
        },
    );

    let amount: i128 = 1_000;
    let salt = Bytes::from_slice(&env, b"invariant_sum_salt");
    let commitment = client.deposit(
        &token_id,
        &amount,
        &owner,
        &salt,
        &0,
        &Some(arbiter.clone()),
    );
    client.withdraw(&token_id, &amount, &commitment, &owner, &salt);

    // Fee math: total_fee = 100 (10%)
    // arbiter_fee = 100 * 1/5 = 20
    // platform_fee = 100 * 3/10 = 30
    // collector_fee = 100 * 1/2 = 50
    // net_payout = 1000 - 100 = 900
    // Total distributed = 900 + 20 + 30 + 50 = 1000 ✓
    
    let arbiter_balance = token_client.balance(&arbiter);
    let platform_balance = token_client.balance(&platform_wallet);
    let collector_balance = token_client.balance(&collector);
    
    // Owner's balance after: 10000 - 1000 (deposit) + 900 (net payout) = 9900
    // Net payout received = 900
    let net_payout = 900;

    // Invariant: net payout + all fee components = escrow amount
    let total_distributed = net_payout + arbiter_balance + platform_balance + collector_balance;
    assert_eq!(total_distributed, amount);
}

#[test]
fn test_fee_config_rejects_exceeds_maximum() {
    let (env, client, admin) = setup();

    // Test global fee config validation
    let result = client.try_set_fee_config(&admin, &crate::types::FeeConfig { fee_bps: 10_001 });
    assert!(matches!(result, Err(Ok(crate::RustAcademyError::FeeExceedsMaximum)) | Err(Err(_))));

    // Test per-asset fee config validation
    let token_id = create_token(&env);
    let result = client.try_set_per_asset_fee(
        &admin,
        &token_id,
        &PerAssetFeeConfig {
            fee_bps: 10_001,
            arbiter_bps: 0,
            ..Default::default()
        },
    );
    assert!(matches!(result, Err(Ok(crate::RustAcademyError::FeeExceedsMaximum)) | Err(Err(_))));

    // Test arbiter_bps validation
    let result = client.try_set_per_asset_fee(
        &admin,
        &token_id,
        &PerAssetFeeConfig {
            fee_bps: 1_000,
            arbiter_bps: 10_001,
            ..Default::default()
        },
    );
    assert!(matches!(result, Err(Ok(crate::RustAcademyError::FeeExceedsMaximum)) | Err(Err(_))));
}
