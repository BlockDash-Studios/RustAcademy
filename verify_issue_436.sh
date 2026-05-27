#!/bin/bash
# Verification script for Issue #436 implementation
# This script checks that all required files exist and are properly configured

set -e

echo "=========================================="
echo "Issue #436 Implementation Verification"
echo "=========================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0

# Function to check if file exists
check_file() {
    local file=$1
    local description=$2
    
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $description"
        ((PASSED++))
    else
        echo -e "${RED}✗${NC} $description - File not found: $file"
        ((FAILED++))
    fi
}

# Function to check if text exists in file
check_content() {
    local file=$1
    local pattern=$2
    local description=$3
    
    if [ -f "$file" ] && grep -q "$pattern" "$file"; then
        echo -e "${GREEN}✓${NC} $description"
        ((PASSED++))
    else
        echo -e "${RED}✗${NC} $description"
        ((FAILED++))
    fi
}

echo "Checking Core Implementation Files..."
echo "--------------------------------------"
check_file "app/contract/contracts/quickex/src/perf_bench.rs" "Main benchmark suite"
check_file "app/contract/contracts/quickex/src/perf_bench_validation.rs" "Validation suite"

echo ""
echo "Checking Documentation Files..."
echo "--------------------------------------"
check_file "app/contract/contracts/quickex/PERFORMANCE_BENCHMARKS.md" "Performance benchmarks guide"
check_file "app/contract/contracts/quickex/ISSUE_436_IMPLEMENTATION.md" "Implementation summary"
check_file "app/contract/TEST_PLAN_ISSUE_436.md" "Test plan"
check_file "app/contract/PR_DESCRIPTION.md" "PR description"
check_file "ISSUE_436_COMPLETE.md" "Completion summary"

echo ""
echo "Checking Developer Tools..."
echo "--------------------------------------"
check_file "app/contract/run_benchmarks.sh" "Linux/Mac helper script"
check_file "app/contract/run_benchmarks.bat" "Windows helper script"

echo ""
echo "Checking CI/CD Files..."
echo "--------------------------------------"
check_file ".github/ISSUE_TEMPLATE/performance_regression.md" "Performance regression issue template"

echo ""
echo "Checking Modified Files..."
echo "--------------------------------------"
check_content "app/contract/contracts/quickex/src/lib.rs" "mod perf_bench" "lib.rs includes perf_bench module"
check_content ".github/workflows/contract.yml" "Run performance benchmarks" "CI workflow includes benchmark step"
check_content ".github/workflows/contract.yml" "Upload benchmark results" "CI workflow includes artifact upload"
check_content "app/contract/README.md" "Performance Benchmarks" "README includes benchmark section"

echo ""
echo "Checking Benchmark Tests..."
echo "--------------------------------------"
check_content "app/contract/contracts/quickex/src/perf_bench.rs" "perf_bench_create_fulfill_flow" "Create/Fulfill benchmark"
check_content "app/contract/contracts/quickex/src/perf_bench.rs" "perf_bench_refund_flow" "Refund benchmark"
check_content "app/contract/contracts/quickex/src/perf_bench.rs" "perf_bench_dispute_resolution_flow" "Dispute resolution benchmark"
check_content "app/contract/contracts/quickex/src/perf_bench.rs" "perf_bench_batch_deposit_flow" "Batch deposit benchmark"
check_content "app/contract/contracts/quickex/src/perf_bench.rs" "perf_bench_deposit_with_commitment" "Deposit with commitment benchmark"
check_content "app/contract/contracts/quickex/src/perf_bench.rs" "perf_bench_privacy_operations" "Privacy operations benchmark"
check_content "app/contract/contracts/quickex/src/perf_bench.rs" "perf_bench_commitment_verification" "Commitment verification benchmark"
check_content "app/contract/contracts/quickex/src/perf_bench.rs" "perf_bench_storage_growth" "Storage growth benchmark"

echo ""
echo "Checking Regression Detection..."
echo "--------------------------------------"
check_content "app/contract/contracts/quickex/src/perf_bench.rs" "THRESHOLD_CREATE_FULFILL_CPU" "CPU threshold defined"
check_content "app/contract/contracts/quickex/src/perf_bench.rs" "THRESHOLD_CREATE_FULFILL_MEM" "Memory threshold defined"
check_content "app/contract/contracts/quickex/src/perf_bench.rs" "BenchmarkResult" "BenchmarkResult struct"
check_content "app/contract/contracts/quickex/src/perf_bench.rs" "assert_passed" "Threshold assertion"

echo ""
echo "Checking Validation Tests..."
echo "--------------------------------------"
check_content "app/contract/contracts/quickex/src/perf_bench_validation.rs" "test_budget_reset_isolation" "Budget reset test"
check_content "app/contract/contracts/quickex/src/perf_bench_validation.rs" "test_benchmarks_measure_operations" "Operation measurement test"
check_content "app/contract/contracts/quickex/src/perf_bench_validation.rs" "test_measurement_consistency" "Consistency test"
check_content "app/contract/contracts/quickex/src/perf_bench_validation.rs" "test_cost_proportionality" "Proportionality test"

echo ""
echo "=========================================="
echo "Verification Results"
echo "=========================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed! Implementation is complete.${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Run tests: cd app/contract && cargo test"
    echo "2. Run benchmarks: cargo test perf_bench_ --release -- --nocapture"
    echo "3. Create PR using PR_DESCRIPTION.md"
    exit 0
else
    echo -e "${RED}✗ Some checks failed. Please review the missing files.${NC}"
    exit 1
fi
