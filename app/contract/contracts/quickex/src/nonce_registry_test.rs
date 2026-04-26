//! Tests for signature replay protection and nonce registry (#299).
//!
//! Covers:
//! - Replay attempt: same nonce rejected on second call.
//! - Expired signature: nonce rejected when `expires_at` is in the past.
//! - Valid nonce: accepted and consumed exactly once.
//! - Domain separation: same nonce for different signers is independent.
//! - No-expiry: `expires_at == 0` is never considered expired.
//! - Message hash: deterministic and domain-bound.

#[cfg(test)]
mod tests {
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        Address, BytesN, Env,
    };

    use crate::{errors::QuickexError, QuickexContract, QuickexContractClient};

    fn setup<'a>() -> (Env, QuickexContractClient<'a>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register(QuickexContract, ());
        let client = QuickexContractClient::new(&env, &id);
        let signer = Address::generate(&env);
        (env, client, signer)
    }

    fn nonce(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    // -----------------------------------------------------------------------
    // Happy path
    // -----------------------------------------------------------------------

    #[test]
    fn valid_nonce_accepted() {
        let (env, client, signer) = setup();
        env.ledger().set_timestamp(1000);
        let n = nonce(&env, 1);
        // expires_at in the future
        client.verify_nonce(&signer, &n, &2000).unwrap();
    }

    #[test]
    fn no_expiry_always_valid() {
        let (env, client, signer) = setup();
        env.ledger().set_timestamp(u64::MAX - 1);
        let n = nonce(&env, 2);
        // expires_at == 0 → never expires
        client.verify_nonce(&signer, &n, &0).unwrap();
    }

    // -----------------------------------------------------------------------
    // Replay protection
    // -----------------------------------------------------------------------

    #[test]
    fn replay_rejected() {
        let (env, client, signer) = setup();
        env.ledger().set_timestamp(1000);
        let n = nonce(&env, 3);
        client.verify_nonce(&signer, &n, &0).unwrap();
        let err = client.try_verify_nonce(&signer, &n, &0).unwrap_err();
        assert_eq!(
            err.unwrap(),
            QuickexError::NonceAlreadyUsed,
            "second call must fail with NonceAlreadyUsed"
        );
    }

    // -----------------------------------------------------------------------
    // Expiry enforcement
    // -----------------------------------------------------------------------

    #[test]
    fn expired_signature_rejected() {
        let (env, client, signer) = setup();
        env.ledger().set_timestamp(5000);
        let n = nonce(&env, 4);
        // expires_at is in the past
        let err = client.try_verify_nonce(&signer, &n, &4999).unwrap_err();
        assert_eq!(
            err.unwrap(),
            QuickexError::SignatureExpired,
            "past expires_at must fail with SignatureExpired"
        );
    }

    #[test]
    fn expires_at_equal_to_now_rejected() {
        let (env, client, signer) = setup();
        env.ledger().set_timestamp(3000);
        let n = nonce(&env, 5);
        // expires_at == now is also expired (>=)
        let err = client.try_verify_nonce(&signer, &n, &3000).unwrap_err();
        assert_eq!(err.unwrap(), QuickexError::SignatureExpired);
    }

    // -----------------------------------------------------------------------
    // Domain separation: different signers, same nonce
    // -----------------------------------------------------------------------

    #[test]
    fn same_nonce_different_signers_are_independent() {
        let (env, client, alice) = setup();
        let bob = Address::generate(&env);
        env.ledger().set_timestamp(1000);
        let n = nonce(&env, 6);
        // Alice consumes nonce 6
        client.verify_nonce(&alice, &n, &0).unwrap();
        // Bob can still use the same nonce bytes — different signer namespace
        client.verify_nonce(&bob, &n, &0).unwrap();
        // But Alice cannot reuse it
        let err = client.try_verify_nonce(&alice, &n, &0).unwrap_err();
        assert_eq!(err.unwrap(), QuickexError::NonceAlreadyUsed);
    }

    // -----------------------------------------------------------------------
    // Message hash: deterministic and domain-bound
    // -----------------------------------------------------------------------

    #[test]
    fn message_hash_is_deterministic() {
        let (env, client, signer) = setup();
        let n = nonce(&env, 7);
        let h1 = client.build_message_hash(&signer, &n, &9999);
        let h2 = client.build_message_hash(&signer, &n, &9999);
        assert_eq!(h1, h2, "same inputs must produce the same hash");
    }

    #[test]
    fn message_hash_differs_by_nonce() {
        let (env, client, signer) = setup();
        let h1 = client.build_message_hash(&signer, &nonce(&env, 8), &0);
        let h2 = client.build_message_hash(&signer, &nonce(&env, 9), &0);
        assert_ne!(h1, h2, "different nonces must produce different hashes");
    }

    #[test]
    fn message_hash_differs_by_signer() {
        let (env, client, alice) = setup();
        let bob = Address::generate(&env);
        let n = nonce(&env, 10);
        let h1 = client.build_message_hash(&alice, &n, &0);
        let h2 = client.build_message_hash(&bob, &n, &0);
        assert_ne!(h1, h2, "different signers must produce different hashes");
    }

    #[test]
    fn message_hash_differs_by_expiry() {
        let (env, client, signer) = setup();
        let n = nonce(&env, 11);
        let h1 = client.build_message_hash(&signer, &n, &1000);
        let h2 = client.build_message_hash(&signer, &n, &2000);
        assert_ne!(h1, h2, "different expires_at must produce different hashes");
    }
}
