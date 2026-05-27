# Performance Benchmark Suite

## Overview

This document describes the performance benchmark suite for the QuickEx contract, implemented to address **Issue #436 - Performance Bench Suite (Instruction Count + Storage Fees)**.

The benchmark suite provides comprehensive performance tracking for core contract flows to ensure execution costs are known and regressions are caught before deployment.

## Purpose

- **Track execution costs**: Measure CPU instruction counts and memory usage for all core operations
- **Detect regressions**: Automatically fail CI builds when costs exceed defined thresholds
- **Enable optimization**: Provide baseline metrics to measure the impact of optimizations
- **Support capacity planning**: Understand storage growth patterns for long-term cost projections

## Benchmarked Flows

### 1. Create/Fulfill Flow (Deposit → Withdraw)

**Description**: The complete happy-path escrow lifecycle where a user deposits funds and a recipient withdraws them.

**Operations Measured**:
- Deposit with commitment generation
- Withdrawal with proof verification

**Thresholds**:
- CPU: 2,200,000 instructions
- Memory: 350,000 bytes

**Test**: `perf_bench_create_fulfill_flow`

### 2. Refund Flow

**Description**: The process of refunding an expired escrow back to the original owner.

**Operations Measured**:
- Escrow expiration check
- Refund execution with status update

**Thresholds**:
- CPU: 1,500,000 instructions
- Memory: 250,000 bytes

**Test**: `perf_bench_refund_flow`

### 3. Dispute Resolution Flow

**Description**: The complete dispute lifecycle including raising a dispute and arbiter resolution.

**Operations Measured**:
- Dispute initiation
- Arbiter resolution with fund transfer

**Thresholds**:
- CPU: 2,000,000 instructions
- Memory: 320,000 bytes

**Test**: `perf_bench_dispute_resolution_flow`

### 4. Batch Deposit Flow

**Description**: Creating multiple escrows in sequence to simulate high-volume merchant scenarios.

**Operations Measured**:
- 3 sequential deposit operations
- Commitment generation for each

**Thresholds**:
- CPU: 5,000,000 instructions
- Memory: 800,000 bytes

**Test**: `perf_bench_batch_deposit_flow`

### 5. Deposit with Pre-Generated Commitment

**Description**: Deposit operation when the commitment is provided upfront (privacy-preserving flow).

**Operations Measured**:
- Deposit with external commitment
- Storage operations

**Thresholds**:
- CPU: 1,100,000 instructions (half of full flow)
- Memory: 175,000 bytes

**Test**: `perf_bench_deposit_with_commitment`

### 6. Privacy Toggle Operations

**Description**: Enabling, checking, and disabling privacy settings.

**Operations Measured**:
- Privacy enable
- Privacy status check
- Privacy disable

**Thresholds**:
- CPU: 500,000 instructions
- Memory: 100,000 bytes

**Test**: `perf_bench_privacy_operations`

### 7. Commitment Verification (View Function)

**Description**: Read-only verification of a proof without executing withdrawal.

**Operations Measured**:
- Commitment recomputation
- Escrow lookup and validation

**Thresholds**:
- CPU: 300,000 instructions
- Memory: 50,000 bytes

**Test**: `perf_bench_commitment_verification`

### 8. Storage Growth Analysis

**Description**: Measures storage cost patterns when creating multiple escrows.

**Operations Measured**:
- 10 sequential escrow creations
- Storage cost per escrow
- Total storage growth

**Thresholds**:
- Average per escrow: < 200,000 bytes

**Test**: `perf_bench_storage_growth`

## Running Benchmarks

### Run All Performance Benchmarks

```bash
cd app/contract
cargo test perf_bench_ --release -- --nocapture
```

### Run Specific Benchmark

```bash
# Create/Fulfill flow
cargo test perf_bench_create_fulfill_flow --release -- --nocapture

# Refund flow
cargo test perf_bench_refund_flow --release -- --nocapture

# Dispute resolution
cargo test perf_bench_dispute_resolution_flow --release -- --nocapture

# Batch deposits
cargo test perf_bench_batch_deposit_flow --release -- --nocapture
```

### Generate CI Report

```bash
cargo test perf_bench_generate_ci_report --release -- --nocapture
```

This generates a comprehensive report suitable for CI artifact collection.

## Understanding Results

### Output Format

Each benchmark outputs results in the following format:

```
[PERF BENCH] Create/Fulfill Flow (Deposit → Withdraw)
  Status:       ✓ PASS
  CPU:          1850000 (threshold: 2200000)
  Memory:       320000 (threshold: 350000)
```

### Status Indicators

- **✓ PASS**: Benchmark passed all thresholds
- **✗ FAIL**: Benchmark exceeded one or more thresholds

### Regression Detection

When a benchmark fails, it shows the percentage by which thresholds were exceeded:

```
[PERF BENCH] Create/Fulfill Flow (Deposit → Withdraw)
  Status:       ✗ FAIL
  CPU:          2420000 (threshold: 2200000)
  Memory:       320000 (threshold: 350000)
  CPU EXCEEDED by 10.00%
```

## Regression Thresholds

Thresholds are defined in `src/perf_bench.rs` and represent the maximum acceptable cost for each operation. They are set based on:

1. **Initial baseline measurements**: Costs measured during initial implementation
2. **Safety margin**: 10-15% buffer above baseline to allow for minor variations
3. **Optimization targets**: Goals for future optimization work

### Updating Thresholds

Thresholds should only be updated when:

1. **Intentional optimizations** reduce costs (lower thresholds)
2. **New features** legitimately increase costs (document justification)
3. **Soroban SDK updates** change cost models (verify across all benchmarks)

To update thresholds, modify the constants in `src/perf_bench.rs`:

```rust
const THRESHOLD_CREATE_FULFILL_CPU: u64 = 2_200_000;
const THRESHOLD_CREATE_FULFILL_MEM: u64 = 350_000;
```

## CI Integration

### Automated Execution

The performance benchmark suite runs automatically in CI on:

- Pull requests to `main` or `develop` branches
- Pushes to `main` or `develop` branches
- Changes to files in `app/contract/**`

### CI Workflow Steps

1. **Run performance benchmarks**: Executes all benchmarks and captures output
2. **Upload benchmark results**: Stores results as CI artifacts (90-day retention)
3. **Check for regressions**: Runs critical benchmarks with strict pass/fail

### Accessing Results

Benchmark results are available as CI artifacts:

1. Navigate to the GitHub Actions run
2. Scroll to "Artifacts" section
3. Download `performance-benchmarks` artifact
4. Review `perf_bench_results.txt`

### Regression Failures

If benchmarks fail in CI:

1. Review the benchmark output to identify which flow exceeded thresholds
2. Investigate recent changes that may have increased costs
3. Profile the specific operation to identify the bottleneck
4. Either optimize the code or justify the cost increase

## Interpreting Costs

### CPU Instructions

- Represents computational complexity
- Directly correlates to transaction fees
- Lower is better for user experience

### Memory Bytes

- Represents storage and working memory usage
- Affects both execution fees and storage fees
- Important for long-term cost sustainability

### Cost Comparison

Use benchmarks to compare:

- **Before/after optimizations**: Measure improvement percentage
- **Different implementations**: Choose the most efficient approach
- **Feature additions**: Understand cost impact of new functionality

## Best Practices

### When Adding New Features

1. Run benchmarks before implementation (baseline)
2. Implement the feature
3. Run benchmarks after implementation
4. Compare results and document cost impact
5. Optimize if costs exceed acceptable thresholds

### When Optimizing

1. Identify the target operation from benchmark results
2. Profile to find the specific bottleneck
3. Implement optimization
4. Run benchmarks to measure improvement
5. Update thresholds if significant improvement achieved

### When Reviewing PRs

1. Check if benchmark results are available in CI artifacts
2. Compare costs to previous runs
3. Question any significant cost increases
4. Approve only if costs are acceptable or justified

## Storage Fee Considerations

### Long-Term Cost Projections

The storage growth benchmark helps estimate long-term costs:

```
Average storage per escrow: 150,000 bytes
Expected monthly escrows: 10,000
Monthly storage growth: 1.5 GB
```

Use these metrics to:

- Plan storage fee budgets
- Optimize data structures
- Implement archival strategies

### Storage Optimization Strategies

1. **Minimize escrow entry size**: Use compact data types
2. **Clean up expired escrows**: Implement garbage collection
3. **Use temporary storage**: For short-lived data
4. **Batch operations**: Reduce per-operation overhead

## Troubleshooting

### Benchmark Failures

**Problem**: Benchmarks fail locally but pass in CI (or vice versa)

**Solution**: Ensure you're running with `--release` flag for consistent optimization levels

**Problem**: Inconsistent results across runs

**Solution**: Budget measurements can vary slightly; thresholds include safety margins to account for this

**Problem**: All benchmarks suddenly fail after SDK update

**Solution**: Soroban SDK updates may change cost models; review release notes and update thresholds if necessary

### Performance Issues

**Problem**: Specific flow exceeds thresholds

**Solution**: 
1. Use `cargo test bench_<operation> --release -- --nocapture` to see detailed costs
2. Profile the operation to identify bottlenecks
3. Review recent changes to that code path
4. Consider algorithmic optimizations

## Future Enhancements

Potential improvements to the benchmark suite:

1. **Historical tracking**: Store results over time to visualize trends
2. **Comparative analysis**: Automatically compare against previous runs
3. **Gas cost estimation**: Convert instruction counts to actual fee estimates
4. **Profiling integration**: Automatic flamegraph generation for failed benchmarks
5. **Benchmark variants**: Test with different input sizes and scenarios

## Related Documentation

- [BUILD_AND_TEST.md](BUILD_AND_TEST.md) - General testing instructions
- [REGRESSION_TESTS.md](REGRESSION_TESTS.md) - Regression test suite
- [bench_test.rs](src/bench_test.rs) - Individual operation benchmarks
- [GitHub Issue #436](https://github.com/Pulsefy/QiuckEx/issues/436) - Original requirement

## Acceptance Criteria Status

✅ **Benchmarks run deterministically in CI**
- All benchmarks use `--release` mode for consistent optimization
- Budget is reset before each measurement
- Setup overhead is excluded from measurements

✅ **Cost regressions are detected early**
- Thresholds defined for all core flows
- CI fails when thresholds are exceeded
- Clear error messages indicate which costs exceeded limits

✅ **Results are comparable across releases**
- Structured output format
- Consistent measurement methodology
- Historical artifacts retained for 90 days

✅ **Benchmark outputs published as CI artifacts**
- Results uploaded to GitHub Actions artifacts
- 90-day retention period
- Accessible for historical comparison

## Summary

The performance benchmark suite provides comprehensive cost tracking for the QuickEx contract, ensuring that execution costs remain predictable and regressions are caught before deployment. By running automatically in CI and publishing results as artifacts, the suite enables data-driven optimization decisions and maintains cost transparency across releases.
