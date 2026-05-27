@echo off
REM Performance Benchmark Runner for QuickEx Contract
REM Issue #436 - Performance Bench Suite

setlocal enabledelayedexpansion

REM Configuration
set RESULTS_DIR=benchmark_results
set TIMESTAMP=%date:~-4%%date:~-10,2%%date:~-7,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%
set RESULTS_FILE=%RESULTS_DIR%\bench_%TIMESTAMP%.txt

echo ========================================
echo QuickEx Performance Benchmark Suite
echo Issue #436 - Performance Bench Suite
echo ========================================
echo.

REM Create results directory if it doesn't exist
if not exist "%RESULTS_DIR%" mkdir "%RESULTS_DIR%"

REM Parse command
set COMMAND=%1
if "%COMMAND%"=="" set COMMAND=all

if "%COMMAND%"=="all" goto run_all
if "%COMMAND%"=="specific" goto run_specific
if "%COMMAND%"=="ci-report" goto ci_report
if "%COMMAND%"=="list" goto list_benchmarks
if "%COMMAND%"=="clean" goto clean_results
if "%COMMAND%"=="help" goto show_usage
if "%COMMAND%"=="--help" goto show_usage
if "%COMMAND%"=="-h" goto show_usage

echo Error: Unknown command '%COMMAND%'
echo.
goto show_usage

:run_all
echo Running performance benchmarks...
echo.
cd contracts\quickex
cargo test perf_bench_ --release -- --nocapture 2>&1 | tee "%RESULTS_FILE%"
if %ERRORLEVEL% EQU 0 (
    echo.
    echo [32mAll benchmarks passed![0m
    echo.
    echo Results saved to: %RESULTS_FILE%
) else (
    echo.
    echo [31mSome benchmarks failed![0m
    exit /b 1
)
goto end

:run_specific
if "%2"=="" (
    echo Error: Please specify a benchmark name
    echo.
    goto list_benchmarks
)
echo Running benchmark: %2
echo.
cd contracts\quickex
cargo test perf_bench_%2 --release -- --nocapture
goto end

:ci_report
echo Generating CI report...
echo.
cd contracts\quickex
cargo test perf_bench_generate_ci_report --release -- --nocapture 2>&1 | tee "%RESULTS_DIR%\ci_report_%TIMESTAMP%.txt"
goto end

:list_benchmarks
echo Available benchmarks:
echo   - create_fulfill_flow
echo   - refund_flow
echo   - dispute_resolution_flow
echo   - batch_deposit_flow
echo   - deposit_with_commitment
echo   - privacy_operations
echo   - commitment_verification
echo   - storage_growth
echo.
goto end

:clean_results
echo Cleaning old benchmark results...
REM Keep only the last 10 results
for /f "skip=10 delims=" %%f in ('dir /b /o-d "%RESULTS_DIR%\bench_*.txt" 2^>nul') do del "%RESULTS_DIR%\%%f" 2>nul
for /f "skip=10 delims=" %%f in ('dir /b /o-d "%RESULTS_DIR%\ci_report_*.txt" 2^>nul') do del "%RESULTS_DIR%\%%f" 2>nul
echo Cleaned old results (kept last 10)
goto end

:show_usage
echo Usage: %0 [command] [options]
echo.
echo Commands:
echo   all                    Run all performance benchmarks (default)
echo   specific ^<name^>        Run a specific benchmark
echo   ci-report             Generate CI report
echo   list                  List available benchmarks
echo   clean                 Clean old benchmark results
echo.
echo Examples:
echo   %0                                    # Run all benchmarks
echo   %0 specific create_fulfill_flow       # Run specific benchmark
echo   %0 ci-report                          # Generate CI report
echo   %0 list                               # List available benchmarks
echo.
goto end

:end
endlocal
