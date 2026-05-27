# Test Plan for Issue #436 - Performance Bench Suite

## Overview

This document provides a comprehensive test plan to validate the implementation of Issue #436 before creating a PR.

## Prerequisites

Ensure the following are installed and available:

- Rust 1.70 or higher (`rustc --version`)
- Cargo (`cargo --version`)
- wasm32-unknown-unknown target (`rustup target list --installed`)

## Test Execution Steps

### Step 1: Code Formatting Check

**Purpose**: Ensure all code follows Rust formatting standards

**Command**:
```bash
cd app/contract
cargo fmt --all -- --check
```

**Expected Result**: No formatting issues reported

**If Failed**: Run `cargo fmt --all` to auto-format code

---

### Step 2: Clippy Linting

**Purpose**: Catch common mistakes and improve code quality

**Command**:
```bash
cd app/contract
cargo clippy --all-targets --all-features -- -D warnings
```

**Expected Result**: No clippy warnings or errors

**If Failed**: Review and fix reported issues

---

### Step 3: Build Check

**Purpose**: Ensure the contract compiles successfully

**Command**:
```bash
cd app/contract
cargo build --target wasm32-unknown-unknown --release
```

**Expected Result**: Build completes successfully with no errors

**If Failed**: Review compilation errors and fix

---

### Step 4: Run All Tests

**Purpose**: Ensure all existing tests still pass

**Command**:
```bash
cd app/contract
cargo test
```

**Expected Result**: All tests pass

**If Failed**: Review test failures and fix issues

---

### Step 5: Run Performance Benchmarks

**Purpose**: Validate the new benchmark suite works correctly

**Command**:
```bash
cd app/contract
cargo test perf_bench_ --release -- --nocapture
```

**Expected Result**: 
- All benchmarks execute successfully
- Output shows structured results with CPU and memory metrics
- All benchmarks pass their thresholds
- Output includes status indicators (✓ PASS)

**Sample Expected Output**:
```
[PERF BENCH] Create/Fulfill Flow (Deposit → Withdraw)
  Status:       ✓ PASS
  CPU:          1850000 (threshold: 2200000)
  Memory:       320000 (threshold: 350000)

[PERF BENCH] Refund Flow
  Status:       ✓ PASS
  CPU:          1200000 (threshold: 1500000)
  Memory:       220000 (threshold: 250000)
```

**If Failed**: Review benchmark failures and investigate cost increases

---

### Step 6: Run Validation Tests

**Purpose**: Ensure benchmark infrastructure works correctly

**Command**:
```bash
cd app/contract
cargo test perf_bench_validation --release -- --nocapture
```

**Expected Result**: All validation tests pass

**Tests Validated**:
- Budget reset isolation
- Operation measurement
- Measurement consistency
- Cost proportionality
- Threshold validation
- Benchmark coverage
- CI integration requirements

**If Failed**: Review validation failures and fix infrastructure issues

---

### Step 7: Run Specific Benchmarks

**Purpose**: Validate individual benchmark flows

**Commands**:
```bash
# Create/Fulfill flow
cargo test perf_bench_create_fulfill_flow --release -- --nocapture

# Refund flow
cargo test perf_bench_refund_flow --release -- --nocapture

# Dispute resolution
cargo test perf_bench_dispute_resolution_flow --release -- --nocapture

# Batch deposits
cargo test perf_bench_batch_deposit_flow --release -- --nocapture

# Deposit with commitment
cargo test perf_bench_deposit_with_commitment --release -- --nocapture

# Privacy operations
cargo test perf_bench_privacy_operations --release -- --nocapture

# Commitment verification
cargo test perf_bench_commitment_verification --release -- --nocapture

# Storage growth
cargo test perf_bench_storage_growth --release -- --nocapture
```

**Expected Result**: Each benchmark passes individually

---

### Step 8: Test Regression Detection

**Purpose**: Validate that the framework correctly identifies regressions

**Command**:
```bash
cargo test perf_bench_regression_detection --release -- --nocapture
```

**Expected Result**: 
- `perf_bench_regression_detection_cpu` should panic (expected)
- `perf_bench_regression_detection_mem` should panic (expected)

These tests validate that the framework correctly fails when thresholds are exceeded.

---

### Step 9: Generate CI Report

**Purpose**: Validate CI report generation

**Command**:
```bash
cargo test perf_bench_generate_ci_report --release -- --nocapture
```

**Expected Result**: 
- Comprehensive report generated
- Summary shows all benchmarks
- Pass/fail status for each benchmark
- Results comparable across releases

---

### Step 10: Test Helper Scripts

**Purpose**: Validate developer tools work correctly

**Linux/Mac**:
```bash
cd app/contract
chmod +x run_benchmarks.sh

# Test all command
./run_benchmarks.sh all

# Test list command
./run_benchmarks.sh list

# Test specific benchmark
./run_benchmarks.sh specific create_fulfill_flow

# Test clean command
./run_benchmarks.sh clean
```

**Windows**:
```cmd
cd app\contract

REM Test all command
run_benchmarks.bat all

REM Test list command
run_benchmarks.bat list

REM Test specific benchmark
run_benchmarks.bat specific create_fulfill_flow

REM Test clean command
run_benchmarks.bat clean
```

**Expected Result**: 
- Scripts execute without errors
- Appropriate output for each command
- Results saved to benchmark_results directory

---

### Step 11: Verify Documentation

**Purpose**: Ensure all documentation is complete and accurate

**Files to Review**:
1. `contracts/quickex/PERFORMANCE_BENCHMARKS.md`
   - [ ] All sections complete
   - [ ] Commands are accurate
   - [ ] Examples are correct
   - [ ] Thresholds documented

2. `contracts/quickex/ISSUE_436_IMPLEMENTATION.md`
   - [ ] Implementation summary complete
   - [ ] All acceptance criteria addressed
   - [ ] Files list is accurate

3. `README.md`
   - [ ] Performance benchmark section added
   - [ ] Commands are correct
   - [ ] Links work

4. `.github/ISSUE_TEMPLATE/performance_regression.md`
   - [ ] Template is complete
   - [ ] All fields present
   - [ ] Format is correct

---

### Step 12: Verify CI Integration

**Purpose**: Ensure CI workflow is correctly configured

**File to Review**: `.github/workflows/contract.yml`

**Checklist**:
- [ ] Performance benchmark step added
- [ ] Upload artifact step configured
- [ ] Artifact name: `performance-benchmarks`
- [ ] Retention days: 90
- [ ] Regression check step added
- [ ] Critical benchmarks run with strict pass/fail

**Manual Verification**:
1. Review the workflow file
2. Ensure all steps are properly indented (YAML syntax)
3. Verify artifact upload configuration
4. Check that benchmark commands are correct

---

## Integration Test Checklist

After all individual tests pass, verify the complete integration:

- [ ] All code is properly formatted (`cargo fmt`)
- [ ] No clippy warnings (`cargo clippy`)
- [ ] Contract builds successfully (`cargo build`)
- [ ] All existing tests pass (`cargo test`)
- [ ] All performance benchmarks pass (`cargo test perf_bench_`)
- [ ] All validation tests pass (`cargo test perf_bench_validation`)
- [ ] Regression detection works correctly
- [ ] CI report generates successfully
- [ ] Helper scripts work on target platform
- [ ] Documentation is complete and accurate
- [ ] CI workflow is properly configured

---

## Pre-PR Checklist

Before creating the PR, ensure:

### Code Quality
- [ ] All tests pass locally
- [ ] Code is formatted (`cargo fmt --all`)
- [ ] No clippy warnings (`cargo clippy --all-targets --all-features -- -D warnings`)
- [ ] Contract builds successfully

### Functionality
- [ ] All 8 core benchmarks execute and pass
- [ ] Validation tests confirm infrastructure works
- [ ] Regression detection correctly identifies threshold violations
- [ ] CI report generates comprehensive output

### Documentation
- [ ] PERFORMANCE_BENCHMARKS.md is complete
- [ ] ISSUE_436_IMPLEMENTATION.md summarizes implementation
- [ ] README.md updated with benchmark section
- [ ] Issue template created for performance regressions

### CI Integration
- [ ] Workflow file updated with benchmark steps
- [ ] Artifact upload configured correctly
- [ ] Regression checks will fail CI on threshold violations

### Developer Experience
- [ ] Helper scripts work on both Linux/Mac and Windows
- [ ] Scripts provide clear output and error messages
- [ ] Results are saved with timestamps for comparison

---

## Expected Test Results Summary

When all tests pass, you should see:

```
Running tests:
  ✓ cargo fmt --all -- --check
  ✓ cargo clippy --all-targets --all-features -- -D warnings
  ✓ cargo build --target wasm32-unknown-unknown --release
  ✓ cargo test (all existing tests)
  ✓ cargo test perf_bench_ (8 benchmarks)
  ✓ cargo test perf_bench_validation (7 validation tests)
  ✓ cargo test perf_bench_generate_ci_report

Total: ~200+ tests passed
```

---

## Troubleshooting

### Issue: Benchmarks fail with threshold violations

**Solution**: 
1. Review which benchmark failed
2. Check if recent changes increased costs
3. Profile the operation to identify bottlenecks
4. Either optimize the code or justify the cost increase
5. Update thresholds if justified (document reason)

### Issue: Validation tests fail

**Solution**:
1. Check which validation test failed
2. Review the benchmark infrastructure code
3. Ensure budget reset is working correctly
4. Verify measurements are consistent

### Issue: Build fails

**Solution**:
1. Review compilation errors
2. Check that all modules are properly declared in lib.rs
3. Verify syntax is correct
4. Ensure all dependencies are available

### Issue: Helper scripts don't work

**Solution**:
1. Check file permissions (Linux/Mac: `chmod +x run_benchmarks.sh`)
2. Verify script syntax
3. Ensure working directory is correct
4. Check that cargo is in PATH

---

## Post-PR Validation

After the PR is merged, verify:

1. **CI Runs Successfully**
   - Check GitHub Actions for the merged PR
   - Verify all benchmark steps execute
   - Confirm artifacts are uploaded

2. **Artifacts Are Accessible**
   - Navigate to Actions run
   - Download `performance-benchmarks` artifact
   - Verify contents are readable

3. **Regression Detection Works**
   - Intentionally introduce a cost increase
   - Verify CI fails with clear error message
   - Revert the change

---

## Success Criteria

The implementation is ready for PR when:

✅ All code quality checks pass (fmt, clippy, build)  
✅ All existing tests continue to pass  
✅ All 8 performance benchmarks execute and pass  
✅ All 7 validation tests pass  
✅ Regression detection correctly identifies violations  
✅ CI report generates comprehensive output  
✅ Helper scripts work on target platforms  
✅ Documentation is complete and accurate  
✅ CI workflow is properly configured  

---

## Commands Quick Reference

```bash
# Navigate to contract directory
cd app/contract

# Format code
cargo fmt --all

# Check formatting
cargo fmt --all -- --check

# Run clippy
cargo clippy --all-targets --all-features -- -D warnings

# Build contract
cargo build --target wasm32-unknown-unknown --release

# Run all tests
cargo test

# Run performance benchmarks
cargo test perf_bench_ --release -- --nocapture

# Run validation tests
cargo test perf_bench_validation --release -- --nocapture

# Generate CI report
cargo test perf_bench_generate_ci_report --release -- --nocapture

# Run helper script (Linux/Mac)
./run_benchmarks.sh all

# Run helper script (Windows)
run_benchmarks.bat all
```

---

## Conclusion

Follow this test plan step-by-step to ensure the implementation is complete, correct, and ready for PR. All tests should pass before creating the pull request.
