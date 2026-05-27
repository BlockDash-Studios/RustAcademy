@echo off
REM Verification script for Issue #436 implementation
REM This script checks that all required files exist and are properly configured

setlocal enabledelayedexpansion

set PASSED=0
set FAILED=0

echo ==========================================
echo Issue #436 Implementation Verification
echo ==========================================
echo.

echo Checking Core Implementation Files...
echo --------------------------------------
call :check_file "app\contract\contracts\quickex\src\perf_bench.rs" "Main benchmark suite"
call :check_file "app\contract\contracts\quickex\src\perf_bench_validation.rs" "Validation suite"

echo.
echo Checking Documentation Files...
echo --------------------------------------
call :check_file "app\contract\contracts\quickex\PERFORMANCE_BENCHMARKS.md" "Performance benchmarks guide"
call :check_file "app\contract\contracts\quickex\ISSUE_436_IMPLEMENTATION.md" "Implementation summary"
call :check_file "app\contract\TEST_PLAN_ISSUE_436.md" "Test plan"
call :check_file "app\contract\PR_DESCRIPTION.md" "PR description"
call :check_file "ISSUE_436_COMPLETE.md" "Completion summary"

echo.
echo Checking Developer Tools...
echo --------------------------------------
call :check_file "app\contract\run_benchmarks.sh" "Linux/Mac helper script"
call :check_file "app\contract\run_benchmarks.bat" "Windows helper script"

echo.
echo Checking CI/CD Files...
echo --------------------------------------
call :check_file ".github\ISSUE_TEMPLATE\performance_regression.md" "Performance regression issue template"

echo.
echo Checking Modified Files...
echo --------------------------------------
call :check_content "app\contract\contracts\quickex\src\lib.rs" "mod perf_bench" "lib.rs includes perf_bench module"
call :check_content ".github\workflows\contract.yml" "Run performance benchmarks" "CI workflow includes benchmark step"
call :check_content ".github\workflows\contract.yml" "Upload benchmark results" "CI workflow includes artifact upload"
call :check_content "app\contract\README.md" "Performance Benchmarks" "README includes benchmark section"

echo.
echo Checking Benchmark Tests...
echo --------------------------------------
call :check_content "app\contract\contracts\quickex\src\perf_bench.rs" "perf_bench_create_fulfill_flow" "Create/Fulfill benchmark"
call :check_content "app\contract\contracts\quickex\src\perf_bench.rs" "perf_bench_refund_flow" "Refund benchmark"
call :check_content "app\contract\contracts\quickex\src\perf_bench.rs" "perf_bench_dispute_resolution_flow" "Dispute resolution benchmark"
call :check_content "app\contract\contracts\quickex\src\perf_bench.rs" "perf_bench_batch_deposit_flow" "Batch deposit benchmark"

echo.
echo Checking Regression Detection...
echo --------------------------------------
call :check_content "app\contract\contracts\quickex\src\perf_bench.rs" "THRESHOLD_CREATE_FULFILL_CPU" "CPU threshold defined"
call :check_content "app\contract\contracts\quickex\src\perf_bench.rs" "THRESHOLD_CREATE_FULFILL_MEM" "Memory threshold defined"
call :check_content "app\contract\contracts\quickex\src\perf_bench.rs" "BenchmarkResult" "BenchmarkResult struct"

echo.
echo Checking Validation Tests...
echo --------------------------------------
call :check_content "app\contract\contracts\quickex\src\perf_bench_validation.rs" "test_budget_reset_isolation" "Budget reset test"
call :check_content "app\contract\contracts\quickex\src\perf_bench_validation.rs" "test_benchmarks_measure_operations" "Operation measurement test"

echo.
echo ==========================================
echo Verification Results
echo ==========================================
echo Passed: %PASSED%
echo Failed: %FAILED%
echo.

if %FAILED% EQU 0 (
    echo [32mAll checks passed! Implementation is complete.[0m
    echo.
    echo Next steps:
    echo 1. Run tests: cd app\contract ^&^& cargo test
    echo 2. Run benchmarks: cargo test perf_bench_ --release -- --nocapture
    echo 3. Create PR using PR_DESCRIPTION.md
    exit /b 0
) else (
    echo [31mSome checks failed. Please review the missing files.[0m
    exit /b 1
)

:check_file
if exist "%~1" (
    echo [32m✓[0m %~2
    set /a PASSED+=1
) else (
    echo [31m✗[0m %~2 - File not found: %~1
    set /a FAILED+=1
)
goto :eof

:check_content
if exist "%~1" (
    findstr /C:"%~2" "%~1" >nul 2>&1
    if !ERRORLEVEL! EQU 0 (
        echo [32m✓[0m %~3
        set /a PASSED+=1
    ) else (
        echo [31m✗[0m %~3
        set /a FAILED+=1
    )
) else (
    echo [31m✗[0m %~3 - File not found: %~1
    set /a FAILED+=1
)
goto :eof
