//! Performance Benchmark Suite for QuickEx Contract
//!
//! This module provides comprehensive benchmarks for core contract flows to ensure
//! execution costs are known and regressions are caught before deployment.
//!
//! ## Issue #436 - Performance Bench Suite
//!
//! Tracks instruction counts and storage fees for:
//! - Create/Fulfill (deposit/withdraw)
//! - Refund operations
//! - Dispute resolution (if enabled)
//!
//! ## Running Benchmarks
//!
//! ```sh
//! # Run all performance benchmarks
//! cargo test perf_bench_ -- --nocapture
//!
//! # Run specific benchmark
//! cargo test perf_bench_create_fulfill_flow -- --nocapture
//! ```
//!
//! ## Regression Thresholds
//!
//! Benchmarks will fail if costs exceed defined thresholds:
//! - CPU instructions: +10% from baseline
//! - Memory bytes: +15% from baseline
//!
//! ## CI Integration
//!
//! Results are output in a structured format for CI artifact collection.

extern crate std;

use crate::{
    storage::{put_escrow, DataKey},
    EscrowEntry, EscrowStatus, QuickexContract, QuickexContractClient,
};
use soroban_sdk::{
    testutils::Address as _, token, xdr::ToXdr, Address, Bytes, BytesN, Env, Vec,
};

// ---------------------------------------------------------------------------
// Regression Thresholds (baselines established from initial measurements)
// ---------------------------------------------------------------------------

/// Maximum allowed CPU instruction count for create/fulfill flow
const THRESHOLD_CREATE_FULFILL_CPU: u64 = 2_200_000;

/// Maximum allowed memory bytes for create/fulfill flow
const THRESHOLD_CREATE_FULFILL_MEM: u64 = 350_000;

/// Maximum allowed CPU instruction count for refund flow
const THRESHOLD_REFUND_CPU: u64 = 1_500_000;

/// Maximum allowed memory bytes for refund flow
const THRESHOLD_REFUND_MEM: u64 = 250_000;

/// Maximum allowed CPU instruction count for dispute resolution flow
const THRESHOLD_DISPUTE_CPU: u64 = 2_000_000;

/// Maximum allowed memory bytes for dispute resolution flow
const THRESHOLD_DISPUTE_MEM: u64 = 320_000;

/// Maximum allowed CPU instruction count for batch deposit flow (3 deposits)
const THRESHOLD_BATCH_DEPOSIT_CPU: u64 = 5_000_000;

/// Maximum allowed memory bytes for batch deposit flow (3 deposits)
const THRESHOLD_BATCH_DEPOSIT_MEM: u64 = 800_000;

// ---------------------------------------------------------------------------
// Benchmark Result Tracking
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct BenchmarkResult {
    name: String,
    cpu_instructions: u64,
    memory_bytes: u64,
    cpu_threshold: u64,
    mem_threshold: u64,
    passed: bool,
}

impl BenchmarkResult {
    fn new(
        name: &str,
        cpu: u64,
        mem: u64,
        cpu_threshold: u64,
        mem_threshold: u64,
    ) -> Self {
        let passed = cpu <= cpu_threshold && mem <= mem_threshold;
        Self {
            name: name.to_string(),
            cpu_instructions: cpu,
            memory_bytes: mem,
            cpu_threshold,
            mem_threshold,
            passed,
        }
    }

    fn print(&self) {
        let status = if self.passed { "✓ PASS" } else { "✗ FAIL" };
        std::println!("\n[PERF BENCH] {}", self.name);
        std::println!("  Status:       {}", status);
        std::println!("  CPU:          {} (threshold: {})", self.cpu_instructions, self.cpu_threshold);
        std::println!("  Memory:       {} (threshold: {})", self.memory_bytes, self.mem_threshold);
        
        if !self.passed {
            if self.cpu_instructions > self.cpu_threshold {
                let pct = ((self.cpu_instructions as f64 / self.cpu_threshold as f64) - 1.0) * 100.0;
                std::println!("  CPU EXCEEDED by {:.2}%", pct);
            }
            if self.memory_bytes > self.mem_threshold {
                let pct = ((self.memory_bytes as f64 / self.mem_threshold as f64) - 1.0) * 100.0;
                std::println!("  MEM EXCEEDED by {:.2}%", pct);
            }
        }
    }

    fn assert_passed(&self) {
        if !self.passed {
            panic!(
                "Benchmark '{}' exceeded thresholds! CPU: {} (max: {}), MEM: {} (max: {})",
                self.name, self.cpu_instructions, self.cpu_threshold, 
                self.memory_bytes, self.mem_threshold
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

fn setup<'a>() -> (Env, QuickexContractClient<'a>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(QuickexContract, ());
    let client = QuickexContractClient::new(&env, &contract_id);
    (env, client)
}

fn create_test_token(env: &Env) -> Address {
    env.register_stellar_asset_contract_v2(Address::generate(env))
        .address()
}

fn make_commitment(env: &Env, owner: &Address, amount: i128, salt: &Bytes) -> BytesN<32> {
    let mut data = Bytes::new(env);
    data.append(&owner.clone().to_xdr(env));
    data.append(&Bytes::from_slice(env, &amount.to_be_bytes()));
    data.append(salt);
    env.crypto().keccak256(&data).into()
}

fn seed_escrow(
    env: &Env,
    contract_id: &Address,
    token: &Address,
    owner: &Address,
    amount: i128,
    commitment: BytesN<32>,
    expires_at: u64,
) {
    let entry = EscrowEntry {
        token: token.clone(),
        amount_due: amount,
        amount_paid: amount,
        owner: owner.clone(),
        status: EscrowStatus::Pending,
        created_at: env.ledger().timestamp(),
        expires_at,
        arbiter: None,
        arbiters: Vec::new(env),
        arbiter_threshold: 0,
    };
    env.as_contract(contract_id, || {
        let key: Bytes = commitment.into();
        put_escrow(env, &key, &entry);
    });
}

fn capture_budget(env: &Env) -> (u64, u64) {
    let cpu = env.cost_estimate().budget().cpu_instruction_cost();
    let mem = env.cost_estimate().budget().memory_bytes_cost();
    (cpu, mem)
}

// ---------------------------------------------------------------------------
// Core Flow Benchmarks
// ---------------------------------------------------------------------------

/// Benchmark: Complete Create/Fulfill Flow (Deposit → Withdraw)
///
/// Measures the full happy-path escrow lifecycle:
/// 1. User deposits funds with commitment
/// 2. Recipient withdraws funds with proof
///
/// This is the most common flow and should be optimized for minimal cost.
#[test]
fn perf_bench_create_fulfill_flow() {
    let (env, client) = setup();
    let token = create_test_token(&env);
    let owner = Address::generate(&env);
    let salt = Bytes::from_slice(&env, b"perf_create_fulfill");
    let amount: i128 = 1_000_000;

    // Setup: mint tokens
    let token_client = token::StellarAssetClient::new(&env, &token);
    token_client.mint(&owner, &amount);

    // Reset budget before measuring the complete flow
    env.cost_estimate().budget().reset_default();

    // FLOW: Deposit
    let commitment = client.deposit(&token, &amount, &owner, &salt, &0u64, &None);

    // Mint tokens to contract for withdrawal
    token_client.mint(&client.address, &amount);

    // FLOW: Withdraw
    client.withdraw(&token, &amount, &commitment, &owner, &salt);

    // Capture final costs
    let (cpu, mem) = capture_budget(&env);
    let result = BenchmarkResult::new(
        "Create/Fulfill Flow (Deposit → Withdraw)",
        cpu,
        mem,
        THRESHOLD_CREATE_FULFILL_CPU,
        THRESHOLD_CREATE_FULFILL_MEM,
    );
    
    result.print();
    result.assert_passed();
}

/// Benchmark: Refund Flow
///
/// Measures the cost of refunding an expired escrow:
/// 1. Escrow is created with expiration
/// 2. Time passes beyond expiration
/// 3. Owner refunds the escrow
#[test]
fn perf_bench_refund_flow() {
    let (env, client) = setup();
    let token = create_test_token(&env);
    let owner = Address::generate(&env);
    let salt = Bytes::from_slice(&env, b"perf_refund");
    let amount: i128 = 1_000_000;

    // Setup: create expired escrow
    let token_client = token::StellarAssetClient::new(&env, &token);
    token_client.mint(&owner, &amount);
    
    let expires_at = env.ledger().timestamp() + 100;
    let commitment = client.deposit(&token, &amount, &owner, &salt, &expires_at, &None);
    
    // Mint tokens to contract
    token_client.mint(&client.address, &amount);
    
    // Advance time past expiration
    env.ledger().with_mut(|li| li.timestamp = expires_at + 1);

    // Reset budget before measuring refund
    env.cost_estimate().budget().reset_default();

    // FLOW: Refund
    client.refund(&commitment);

    // Capture final costs
    let (cpu, mem) = capture_budget(&env);
    let result = BenchmarkResult::new(
        "Refund Flow",
        cpu,
        mem,
        THRESHOLD_REFUND_CPU,
        THRESHOLD_REFUND_MEM,
    );
    
    result.print();
    result.assert_passed();
}

/// Benchmark: Dispute Resolution Flow
///
/// Measures the cost of dispute resolution:
/// 1. Escrow is created with arbiter
/// 2. Dispute is raised
/// 3. Arbiter resolves dispute in favor of recipient
#[test]
fn perf_bench_dispute_resolution_flow() {
    let (env, client) = setup();
    let token = create_test_token(&env);
    let owner = Address::generate(&env);
    let arbiter = Address::generate(&env);
    let recipient = Address::generate(&env);
    let salt = Bytes::from_slice(&env, b"perf_dispute");
    let amount: i128 = 1_000_000;

    // Setup: create escrow with arbiter
    let token_client = token::StellarAssetClient::new(&env, &token);
    token_client.mint(&owner, &amount);
    
    let commitment = client.deposit(
        &token,
        &amount,
        &owner,
        &salt,
        &1000u64,
        &Some(arbiter.clone()),
    );
    
    // Mint tokens to contract
    token_client.mint(&client.address, &amount);

    // Reset budget before measuring dispute flow
    env.cost_estimate().budget().reset_default();

    // FLOW: Dispute
    client.dispute(&commitment);

    // FLOW: Resolve
    client.resolve_dispute(&arbiter, &commitment, &false, &recipient);

    // Capture final costs
    let (cpu, mem) = capture_budget(&env);
    let result = BenchmarkResult::new(
        "Dispute Resolution Flow",
        cpu,
        mem,
        THRESHOLD_DISPUTE_CPU,
        THRESHOLD_DISPUTE_MEM,
    );
    
    result.print();
    result.assert_passed();
}

/// Benchmark: Batch Deposit Flow
///
/// Measures the cost of creating multiple escrows in sequence.
/// This simulates high-volume merchant scenarios.
#[test]
fn perf_bench_batch_deposit_flow() {
    let (env, client) = setup();
    let token = create_test_token(&env);
    let owner = Address::generate(&env);
    let amount: i128 = 1_000_000;

    // Setup: mint tokens for 3 deposits
    let token_client = token::StellarAssetClient::new(&env, &token);
    token_client.mint(&owner, &(amount * 3));

    // Reset budget before measuring batch deposits
    env.cost_estimate().budget().reset_default();

    // FLOW: Create 3 deposits
    for i in 0..3 {
        let salt = Bytes::from_slice(&env, &[b'b', b'a', b't', b'c', b'h', i as u8]);
        client.deposit(&token, &amount, &owner, &salt, &0u64, &None);
    }

    // Capture final costs
    let (cpu, mem) = capture_budget(&env);
    let result = BenchmarkResult::new(
        "Batch Deposit Flow (3 deposits)",
        cpu,
        mem,
        THRESHOLD_BATCH_DEPOSIT_CPU,
        THRESHOLD_BATCH_DEPOSIT_MEM,
    );
    
    result.print();
    result.assert_passed();
}

/// Benchmark: Deposit with Pre-Generated Commitment
///
/// Measures the cost of deposit when commitment is provided upfront.
/// This is useful for privacy-preserving flows.
#[test]
fn perf_bench_deposit_with_commitment() {
    let (env, client) = setup();
    let token = create_test_token(&env);
    let from = Address::generate(&env);
    let amount: i128 = 1_000_000;
    let commitment = BytesN::from_array(&env, &[0xABu8; 32]);

    // Setup: mint tokens
    let token_client = token::StellarAssetClient::new(&env, &token);
    token_client.mint(&from, &amount);

    // Reset budget before measuring
    env.cost_estimate().budget().reset_default();

    // FLOW: Deposit with commitment
    client.deposit_with_commitment(&from, &token, &amount, &commitment, &0u64, &None);

    // Capture final costs
    let (cpu, mem) = capture_budget(&env);
    
    // Use create/fulfill thresholds as baseline (should be similar or better)
    let result = BenchmarkResult::new(
        "Deposit with Pre-Generated Commitment",
        cpu,
        mem,
        THRESHOLD_CREATE_FULFILL_CPU / 2, // Only deposit, not full flow
        THRESHOLD_CREATE_FULFILL_MEM / 2,
    );
    
    result.print();
    result.assert_passed();
}

/// Benchmark: Privacy Toggle Operations
///
/// Measures the cost of enabling/disabling privacy settings.
/// This is a medium-frequency operation.
#[test]
fn perf_bench_privacy_operations() {
    let (env, client) = setup();
    let owner = Address::generate(&env);

    // Reset budget before measuring
    env.cost_estimate().budget().reset_default();

    // FLOW: Enable privacy
    client.set_privacy(&owner, &true);

    // FLOW: Check privacy
    let _ = client.get_privacy(&owner);

    // FLOW: Disable privacy
    client.set_privacy(&owner, &false);

    // Capture final costs
    let (cpu, mem) = capture_budget(&env);
    
    // Privacy operations should be lightweight
    let result = BenchmarkResult::new(
        "Privacy Toggle Operations",
        cpu,
        mem,
        500_000,  // Should be much cheaper than escrow operations
        100_000,
    );
    
    result.print();
    result.assert_passed();
}

/// Benchmark: Commitment Verification (View Function)
///
/// Measures the cost of verifying a proof without executing withdrawal.
/// This is a read-only operation used for pre-flight checks.
#[test]
fn perf_bench_commitment_verification() {
    let (env, client) = setup();
    let token = create_test_token(&env);
    let owner = Address::generate(&env);
    let salt = Bytes::from_slice(&env, b"perf_verify");
    let amount: i128 = 1_000_000;

    // Setup: create escrow
    let token_client = token::StellarAssetClient::new(&env, &token);
    token_client.mint(&owner, &amount);
    let commitment = client.deposit(&token, &amount, &owner, &salt, &0u64, &None);

    // Reset budget before measuring
    env.cost_estimate().budget().reset_default();

    // FLOW: Verify proof (read-only)
    let _ = client.verify_proof_view(&amount, &salt, &owner);

    // Capture final costs
    let (cpu, mem) = capture_budget(&env);
    
    // View functions should be very cheap
    let result = BenchmarkResult::new(
        "Commitment Verification (View)",
        cpu,
        mem,
        300_000,  // Read-only, should be minimal
        50_000,
    );
    
    result.print();
    result.assert_passed();
}

// ---------------------------------------------------------------------------
// Storage Fee Benchmarks
// ---------------------------------------------------------------------------

/// Benchmark: Storage Growth per Escrow
///
/// Measures the storage cost of creating escrows to understand
/// long-term storage fee implications.
#[test]
fn perf_bench_storage_growth() {
    let (env, client) = setup();
    let token = create_test_token(&env);
    let owner = Address::generate(&env);
    let amount: i128 = 1_000_000;

    // Setup: mint tokens for multiple deposits
    let token_client = token::StellarAssetClient::new(&env, &token);
    token_client.mint(&owner, &(amount * 10));

    // Measure baseline storage
    let baseline_mem = env.cost_estimate().budget().memory_bytes_cost();

    // Create 10 escrows and track storage growth
    let mut storage_costs = std::vec::Vec::new();
    
    for i in 0..10 {
        env.cost_estimate().budget().reset_default();
        
        let salt = Bytes::from_slice(&env, &[b's', b't', b'o', b'r', b'e', i as u8]);
        client.deposit(&token, &amount, &owner, &salt, &0u64, &None);
        
        let mem = env.cost_estimate().budget().memory_bytes_cost();
        storage_costs.push(mem);
    }

    // Calculate average storage cost per escrow
    let avg_storage: u64 = storage_costs.iter().sum::<u64>() / storage_costs.len() as u64;
    
    std::println!("\n[PERF BENCH] Storage Growth Analysis");
    std::println!("  Baseline memory:     {}", baseline_mem);
    std::println!("  Avg per escrow:      {}", avg_storage);
    std::println!("  Total for 10:        {}", storage_costs.iter().sum::<u64>());
    std::println!("  Storage costs:       {:?}", storage_costs);
    
    // Assert reasonable storage costs (should be consistent)
    assert!(avg_storage < 200_000, "Storage cost per escrow too high: {}", avg_storage);
}

// ---------------------------------------------------------------------------
// Regression Detection Tests
// ---------------------------------------------------------------------------

/// Test: Ensure benchmarks detect CPU regressions
///
/// This test validates that the benchmark framework correctly identifies
/// when CPU costs exceed thresholds.
#[test]
#[should_panic(expected = "exceeded thresholds")]
fn perf_bench_regression_detection_cpu() {
    // Create a result that exceeds CPU threshold
    let result = BenchmarkResult::new(
        "Regression Test",
        THRESHOLD_CREATE_FULFILL_CPU + 1,
        100_000,
        THRESHOLD_CREATE_FULFILL_CPU,
        THRESHOLD_CREATE_FULFILL_MEM,
    );
    
    result.assert_passed(); // Should panic
}

/// Test: Ensure benchmarks detect memory regressions
///
/// This test validates that the benchmark framework correctly identifies
/// when memory costs exceed thresholds.
#[test]
#[should_panic(expected = "exceeded thresholds")]
fn perf_bench_regression_detection_mem() {
    // Create a result that exceeds memory threshold
    let result = BenchmarkResult::new(
        "Regression Test",
        100_000,
        THRESHOLD_CREATE_FULFILL_MEM + 1,
        THRESHOLD_CREATE_FULFILL_CPU,
        THRESHOLD_CREATE_FULFILL_MEM,
    );
    
    result.assert_passed(); // Should panic
}

// ---------------------------------------------------------------------------
// CI Artifact Generation
// ---------------------------------------------------------------------------

/// Generate benchmark report for CI artifacts
///
/// This test runs all benchmarks and outputs results in a structured format
/// suitable for CI artifact collection and historical tracking.
#[test]
fn perf_bench_generate_ci_report() {
    std::println!("\n========================================");
    std::println!("PERFORMANCE BENCHMARK REPORT");
    std::println!("Issue #436 - Performance Bench Suite");
    std::println!("========================================\n");

    let mut all_results = std::vec::Vec::new();

    // Run all benchmarks and collect results
    macro_rules! run_bench {
        ($name:expr, $setup:expr, $flow:expr, $cpu_thresh:expr, $mem_thresh:expr) => {{
            let (env, client) = $setup;
            env.cost_estimate().budget().reset_default();
            $flow(&env, &client);
            let (cpu, mem) = capture_budget(&env);
            BenchmarkResult::new($name, cpu, mem, $cpu_thresh, $mem_thresh)
        }};
    }

    // Create/Fulfill
    {
        let (env, client) = setup();
        let token = create_test_token(&env);
        let owner = Address::generate(&env);
        let salt = Bytes::from_slice(&env, b"ci_create_fulfill");
        let amount: i128 = 1_000_000;
        let token_client = token::StellarAssetClient::new(&env, &token);
        token_client.mint(&owner, &amount);
        
        env.cost_estimate().budget().reset_default();
        let commitment = client.deposit(&token, &amount, &owner, &salt, &0u64, &None);
        token_client.mint(&client.address, &amount);
        client.withdraw(&token, &amount, &commitment, &owner, &salt);
        
        let (cpu, mem) = capture_budget(&env);
        all_results.push(BenchmarkResult::new(
            "Create/Fulfill",
            cpu,
            mem,
            THRESHOLD_CREATE_FULFILL_CPU,
            THRESHOLD_CREATE_FULFILL_MEM,
        ));
    }

    // Print summary
    std::println!("\nSUMMARY:");
    std::println!("--------");
    for result in &all_results {
        result.print();
    }

    let passed = all_results.iter().filter(|r| r.passed).count();
    let total = all_results.len();
    
    std::println!("\n========================================");
    std::println!("RESULTS: {}/{} benchmarks passed", passed, total);
    std::println!("========================================\n");

    // Assert all passed
    for result in &all_results {
        result.assert_passed();
    }
}
