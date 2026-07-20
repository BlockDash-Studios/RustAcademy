use crate::{errors::RustAcademyError, storage, test_context::TestContext, types::Role};
use soroban_sdk::{testutils::Address as _, Address, Vec};

#[test]
fn test_initial_admin_has_role() {
    let ctx = TestContext::with_admin();
    let roles = ctx.client.get_roles(&ctx.admin);
    assert!(roles.contains(Role::Admin));
}

#[test]
fn test_grant_and_revoke_role() {
    let ctx = TestContext::with_admin();
    let user = Address::generate(&ctx.env);

    // Grant Operator role
    ctx.client.grant_role(&ctx.admin, &user, &Role::Operator);
    let roles = ctx.client.get_roles(&user);
    assert!(roles.contains(Role::Operator));

    // Revoke Operator role
    ctx.client.revoke_role(&ctx.admin, &user, &Role::Operator);
    let roles = ctx.client.get_roles(&user);
    assert!(!roles.contains(Role::Operator));
}

#[test]
fn test_admin_transfer_requires_acceptance_and_can_be_cancelled() {
    let ctx = TestContext::with_admin();
    let pending_admin = ctx.bob.clone();

    ctx.client
        .propose_admin_transfer(&ctx.admin, &pending_admin);
    assert_eq!(
        ctx.client.get_pending_admin_transfer(),
        Some(pending_admin.clone())
    );

    ctx.client.cancel_admin_transfer(&ctx.admin);
    assert_eq!(ctx.client.get_pending_admin_transfer(), None);

    let cancelled_accept = ctx.client.try_accept_admin_transfer(&pending_admin);
    assert!(matches!(
        cancelled_accept,
        Err(Ok(RustAcademyError::NoPendingAdminTransfer))
    ));

    ctx.client
        .propose_admin_transfer(&ctx.admin, &pending_admin);
    ctx.client.accept_admin_transfer(&pending_admin);

    assert_eq!(ctx.client.get_admin(), Some(pending_admin.clone()));
    assert!(ctx.client.get_roles(&pending_admin).contains(Role::Admin));
    assert!(!ctx.client.get_roles(&ctx.admin).contains(Role::Admin));
}

#[test]
fn test_clear_roles_preserves_current_admin_role() {
    let ctx = TestContext::with_admin();

    ctx.client
        .grant_role(&ctx.admin, &ctx.admin, &Role::Operator);
    ctx.client
        .grant_role(&ctx.admin, &ctx.admin, &Role::Arbiter);

    ctx.client.clear_roles(&ctx.admin, &ctx.admin);

    let roles = ctx.client.get_roles(&ctx.admin);
    assert!(roles.contains(Role::Admin));
    assert!(!roles.contains(Role::Operator));
    assert!(!roles.contains(Role::Arbiter));
}

#[test]
fn test_cannot_revoke_admin_role_from_current_admin() {
    let ctx = TestContext::with_admin();

    let result = ctx
        .client
        .try_revoke_role(&ctx.admin, &ctx.admin, &Role::Admin);
    assert!(matches!(
        result,
        Err(Ok(RustAcademyError::InvalidRoleState))
    ));
}

#[test]
fn test_corrupt_admin_role_state_blocks_public_calls() {
    let ctx = TestContext::with_admin();

    ctx.env.as_contract(&ctx.client.address, || {
        let roles = Vec::new(&ctx.env);
        storage::set_roles(&ctx.env, &ctx.admin, &roles);
    });

    let result = ctx.client.try_set_paused(&ctx.admin, &true);
    assert!(matches!(
        result,
        Err(Ok(RustAcademyError::InvalidRoleState))
    ));
}

#[test]
fn test_unauthorized_grant_fails() {
    let ctx = TestContext::with_admin();

    // Alice tries to grant a role to Bob
    let res = ctx
        .client
        .try_grant_role(&ctx.alice, &ctx.bob, &Role::Operator);
    assert!(res.is_err());
}

#[test]
fn test_operator_can_pause() {
    let ctx = TestContext::with_admin();
    let operator = ctx.alice.clone();

    // Grant Operator role to Alice
    ctx.client
        .grant_role(&ctx.admin, &operator, &Role::Operator);

    // Alice (Operator) pauses the contract
    ctx.client.set_paused(&operator, &true);
    assert!(ctx.client.is_paused());

    // Alice unpauses
    ctx.client.set_paused(&operator, &false);
    assert!(!ctx.client.is_paused());
}

#[test]
fn test_arbiter_role_resolution() {
    let ctx = TestContext::with_admin();
    let global_arbiter = ctx.bob.clone();

    // Grant Arbiter role to Bob
    ctx.client
        .grant_role(&ctx.admin, &global_arbiter, &Role::Arbiter);

    // Create a dispute WITHOUT a per-escrow arbiter (wait, deposit requires Option<Address>)
    // Actually, let's create it WITH a different arbiter but let the global one resolve it.
    let per_escrow_arbiter = Address::generate(&ctx.env);
    ctx.mint(&ctx.alice, 1000);
    let commitment = ctx.client.deposit(
        &ctx.token,
        &1000,
        &ctx.alice,
        &ctx.salt(b"salt"),
        &3600,
        &Some(per_escrow_arbiter.clone()),
    );

    // Dispute it
    ctx.client.dispute(&commitment);

    // Global arbiter (Bob) resolves it
    ctx.client
        .resolve_dispute(&global_arbiter, &commitment, &true, &ctx.alice);

    // Verify resolution
    let status = ctx.client.get_commitment_state(&commitment).unwrap();
    assert_eq!(status, crate::types::EscrowStatus::Refunded);
}

#[test]
fn test_insufficient_role_error() {
    let ctx = TestContext::with_admin();

    // Alice (no roles) tries to set fee config
    let res = ctx.client.try_set_fee_config(
        &ctx.alice,
        &crate::types::FeeConfig {
            fee_bps: 100,
            schema_version: crate::types::FEE_CONFIG_SCHEMA_VERSION,
        },
    );

    match res {
        Err(Ok(RustAcademyError::InsufficientRole)) => (),
        other => assert!(
            false,
            "Expected InsufficientRole error but got: {:?}",
            other
        ),
    }
}

// ============================================================================
// Issue #53 — function visibility / feature gating
// ============================================================================

/// `enable_privacy` is rejected while the `SetPrivacy` feature is paused.
#[test]
fn test_enable_privacy_blocked_when_set_privacy_feature_paused() {
    let ctx = TestContext::with_admin();
    ctx.client
        .pause_features(&ctx.admin, &(storage::PauseFlag::SetPrivacy as u64));

    let res = ctx.client.try_enable_privacy(&ctx.alice, &1);
    assert!(res.is_err());
}

/// `set_privacy` is rejected while the same `SetPrivacy` feature is paused.
#[test]
fn test_set_privacy_blocked_when_set_privacy_feature_paused() {
    let ctx = TestContext::with_admin();
    ctx.client
        .pause_features(&ctx.admin, &(storage::PauseFlag::SetPrivacy as u64));

    let res = ctx.client.try_set_privacy(&ctx.alice, &true);
    assert!(res.is_err());
}

/// `create_amount_commitment` is rejected while its feature flag is paused.
#[test]
fn test_create_amount_commitment_blocked_when_feature_paused() {
    let ctx = TestContext::with_admin();
    ctx.client.pause_features(
        &ctx.admin,
        &(storage::PauseFlag::CreateAmountCommitment as u64),
    );

    let salt = ctx.salt(b"gate");
    let res = ctx
        .client
        .try_create_amount_commitment(&ctx.alice, &1_000i128, &salt);
    assert!(res.is_err());
}

/// Sanity: the gated calls still succeed when their features are not paused.
#[test]
fn test_gated_privacy_and_commitment_work_when_unpaused() {
    let ctx = TestContext::with_admin();
    assert!(ctx.client.enable_privacy(&ctx.alice, &2));

    let salt = ctx.salt(b"ok");
    let _ = ctx
        .client
        .create_amount_commitment(&ctx.alice, &1_000i128, &salt);
}