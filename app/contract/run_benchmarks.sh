#!/bin/bash
# Performance Benchmark Runner for QuickEx Contract
# Issue #436 - Performance Bench Suite

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
RESULTS_DIR="benchmark_results"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RESULTS_FILE="${RESULTS_DIR}/bench_${TIMESTAMP}.txt"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}QuickEx Performance Benchmark Suite${NC}"
echo -e "${BLUE}Issue #436 - Performance Bench Suite${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Create results directory if it doesn't exist
mkdir -p "${RESULTS_DIR}"

# Function to run benchmarks
run_benchmarks() {
    echo -e "${YELLOW}Running performance benchmarks...${NC}\n"
    
    cd contracts/quickex
    
    # Run all performance benchmarks
    if cargo test perf_bench_ --release -- --nocapture 2>&1 | tee "${RESULTS_FILE}"; then
        echo -e "\n${GREEN}✓ All benchmarks passed!${NC}"
        return 0
    else
        echo -e "\n${RED}✗ Some benchmarks failed!${NC}"
        return 1
    fi
}

# Function to run specific benchmark
run_specific_benchmark() {
    local bench_name=$1
    echo -e "${YELLOW}Running benchmark: ${bench_name}${NC}\n"
    
    cd contracts/quickex
    cargo test "perf_bench_${bench_name}" --release -- --nocapture
}

# Function to generate CI report
generate_ci_report() {
    echo -e "${YELLOW}Generating CI report...${NC}\n"
    
    cd contracts/quickex
    cargo test perf_bench_generate_ci_report --release -- --nocapture 2>&1 | tee "${RESULTS_DIR}/ci_report_${TIMESTAMP}.txt"
}

# Function to compare with previous results
compare_results() {
    echo -e "${YELLOW}Comparing with previous results...${NC}\n"
    
    local latest=$(ls -t "${RESULTS_DIR}"/bench_*.txt 2>/dev/null | head -n 1)
    local previous=$(ls -t "${RESULTS_DIR}"/bench_*.txt 2>/dev/null | head -n 2 | tail -n 1)
    
    if [ -z "$previous" ] || [ "$latest" == "$previous" ]; then
        echo -e "${YELLOW}No previous results found for comparison${NC}"
        return
    fi
    
    echo -e "${BLUE}Latest:   ${latest}${NC}"
    echo -e "${BLUE}Previous: ${previous}${NC}\n"
    
    # Extract CPU and memory values and compare
    echo -e "${BLUE}Comparison:${NC}"
    echo "----------------------------------------"
    
    # Simple diff of the files
    diff -u "$previous" "$latest" || true
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  all                    Run all performance benchmarks (default)"
    echo "  specific <name>        Run a specific benchmark"
    echo "  ci-report             Generate CI report"
    echo "  compare               Compare with previous results"
    echo "  list                  List available benchmarks"
    echo "  clean                 Clean old benchmark results"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Run all benchmarks"
    echo "  $0 specific create_fulfill_flow       # Run specific benchmark"
    echo "  $0 ci-report                          # Generate CI report"
    echo "  $0 compare                            # Compare with previous run"
    echo ""
}

# Function to list available benchmarks
list_benchmarks() {
    echo -e "${BLUE}Available benchmarks:${NC}"
    echo "  - create_fulfill_flow"
    echo "  - refund_flow"
    echo "  - dispute_resolution_flow"
    echo "  - batch_deposit_flow"
    echo "  - deposit_with_commitment"
    echo "  - privacy_operations"
    echo "  - commitment_verification"
    echo "  - storage_growth"
    echo ""
}

# Function to clean old results
clean_results() {
    echo -e "${YELLOW}Cleaning old benchmark results...${NC}"
    
    # Keep only the last 10 results
    ls -t "${RESULTS_DIR}"/bench_*.txt 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true
    ls -t "${RESULTS_DIR}"/ci_report_*.txt 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true
    
    echo -e "${GREEN}✓ Cleaned old results (kept last 10)${NC}"
}

# Main script logic
case "${1:-all}" in
    all)
        run_benchmarks
        RESULT=$?
        echo -e "\n${BLUE}Results saved to: ${RESULTS_FILE}${NC}"
        exit $RESULT
        ;;
    specific)
        if [ -z "$2" ]; then
            echo -e "${RED}Error: Please specify a benchmark name${NC}"
            list_benchmarks
            exit 1
        fi
        run_specific_benchmark "$2"
        ;;
    ci-report)
        generate_ci_report
        ;;
    compare)
        compare_results
        ;;
    list)
        list_benchmarks
        ;;
    clean)
        clean_results
        ;;
    help|--help|-h)
        show_usage
        ;;
    *)
        echo -e "${RED}Error: Unknown command '$1'${NC}\n"
        show_usage
        exit 1
        ;;
esac
