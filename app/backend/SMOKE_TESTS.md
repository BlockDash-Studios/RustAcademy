# Smoke Tests - Deployment Validation

## Overview

This directory contains end-to-end smoke tests that validate the deployment health and critical functionality of the RustAcademy backend API. These tests are designed to run automatically after deployment to ensure the system is functioning correctly.

## Purpose

Smoke tests provide rapid validation of:

- **Critical endpoints** (health, readiness, link metadata, username search)
- **External dependencies** (Supabase, Horizon, Soroban RPC)
- **Network configuration** (Stellar network connectivity)
- **Performance benchmarks** (response time thresholds)
- **Error handling** (proper error responses and status codes)

## Test Files

### `smoke.e2e-spec.ts`

Comprehensive smoke tests covering:

- Health and readiness endpoints
- Network configuration validation
- Link metadata generation
- Username discovery endpoints (search, trending, recently active)
- Asset metadata endpoints
- Critical dependency validation
- Rate limiting verification
- Error handling
- Performance benchmarks

### `smoke-soroban-horizon.e2e-spec.ts`

Specialized tests for Stellar infrastructure:

- Soroban RPC connectivity and operations
- Horizon connectivity and account operations
- Network consistency validation
- Transaction simulation
- Error resilience
- Performance benchmarks for external services

### Export Failure Notification Tests

The export generation handler now includes retry semantics and user notification on failure:

- **Retry Backoff**: Exponential backoff with delays of 1m, 5m, 30m
- **User Notification**: In-app notification dispatched via NotificationService when export permanently fails
- **DLQ Enrichment**: Structured failure details logged for debugging (userId, exportType, format, deliveryMethod, attempt count)
- **Notification Payload**: `ExportFailedPayload` includes error message, attempt count, and permanent flag

Unit tests cover:
- Retry attempt logging with backoff delay calculation
- DLQ enrichment on final failure
- User notification dispatch with correct payload
- Notification failure isolation (does not re-throw)

### Export Delivery Pipeline Tests

The export generation handler now supports three delivery methods configured via environment variables:

- **Webhook Delivery**: POSTs export data to a configured `webhookUrl`
- **Email Delivery**: Sends export as a SendGrid attachment (requires `SENDGRID_API_KEY` + `SENDGRID_FROM_EMAIL`)
- **Download Link**: Uploads export to Supabase Storage (`EXPORT_STORAGE_BUCKET`) and returns a signed URL (`EXPORT_LINK_EXPIRY_MS`)

Configuration variables:
- `EXPORT_STORAGE_BUCKET` — Supabase Storage bucket for export files
- `EXPORT_LINK_EXPIRY_MS` — Signed URL expiry in milliseconds (default: 7 days)
- `EXPORT_WEBHOOK_TIMEOUT_MS` — HTTP timeout for webhook delivery (default: 30s)
- `APP_BASE_URL` — Base URL for constructing absolute download links

Unit tests cover:
- Webhook delivery adapter: 2xx success, non-2xx failure, missing webhook URL
- Email delivery adapter: SendGrid success, missing config failure, missing recipient
- Download link adapter: Upload + signed URL success, missing bucket failure
- Handler integration: Correct adapter invocation, delivery notification dispatch

## Running Smoke Tests

### Local Development

```bash
# Run all smoke tests
npm run test:smoke:all

# Run general smoke tests only
npm run test:smoke

# Run Soroban/Horizon specific tests
npm run test:smoke:soroban
```

### Against Remote Environment

```bash
# Test against production
SMOKE_TEST_BASE_URL=https://api. RustAcademy.io npm run test:smoke:all

# Test against staging
SMOKE_TEST_BASE_URL=https://api-staging. RustAcademy.io npm run test:smoke:all
```

### CI/CD Integration

Smoke tests run automatically:

1. **After deployment** - Triggered by deployment status events
2. **Manual trigger** - Via workflow_dispatch with environment selection
3. **Pull requests** - As part of the CI pipeline

## CI/CD Workflow

The smoke test workflow (`.github/workflows/smoke-tests.yml`):

### Triggers

- Deployment status: success
- Manual workflow dispatch

### Environment Detection

- **Production**: `https://api. RustAcademy.io`
- **Staging**: `https://api-staging. RustAcademy.io`
- **Development**: `http://localhost:3000`

### Workflow Steps

1. Wait for deployment to be ready (health check)
2. Run smoke test suites
3. Generate test report
4. Update deployment status
5. Notify on failure

### Environment Variables

- `SMOKE_TEST_BASE_URL`: Target API URL
- `NODE_ENV`: Test environment
- `STELLAR_NETWORK`: Stellar network (mainnet/testnet)
- `RustAcademy_CONTRACT_ID`: Active contract ID used by Soroban-dependent checks
- `INGESTION_ENABLED`: Must be `true` before boot-time ingestion is allowed

### Ingestion Safety Gate

Before enabling contract event ingestion in any shared environment:

1. Set `INGESTION_ENABLED=true`; `RustAcademy_CONTRACT_ID` alone no longer starts ingestion.
2. Publish the active `RustAcademy` registry entry with matching `contractId`.
3. Include `metadata.eventSchemaVersion` in the registry entry and keep it aligned with the backend-supported schema version.
4. If dual-read is configured, provide `previousContractId` plus `effectiveLedger` or `effectiveTime`.

If registry validation fails, the backend now refuses to start ingestion instead of falling back to an unvalidated event stream.

## Test Categories

### Health Tests

- `/health` endpoint returns 200 with status
- `/ready` endpoint validates all dependencies
- Latency metrics for external services

### Network Tests

- Network configuration validation
- Horizon connectivity
- Soroban RPC connectivity
- Network consistency across services

### Link Tests

- Link metadata generation for XLM
- Privacy flag handling
- Expiration date calculation
- Asset validation
- Amount validation

### Username Tests

- Search endpoint with fuzzy matching
- Trending creators endpoint
- Recently active users endpoint
- Query validation

### Soroban RPC Tests

- Network passphrase retrieval
- Transaction simulation
- Account operations
- Timeout handling

### Horizon Tests

- Account information retrieval
- Payment history fetching
- Asset filtering
- Pagination

### Performance Tests

- Health endpoint: < 100ms
- Link metadata: < 500ms
- Username search: < 1000ms
- Soroban RPC operations: < 2s
- Horizon operations: < 5s

## Critical Failures

Tests are marked as critical if they involve:

- Health checks
- Database connectivity
- External service connectivity
- Network configuration
- Migration status

Critical failures will:

- Fail the deployment
- Trigger immediate notifications
- Block further deployment steps

## Test Reporter Utility

The `SmokeTestReporter` utility provides:

- Test result aggregation
- Console output formatting
- GitHub Actions summary generation
- JSON export for integration
- Critical failure detection

### Usage Example

```typescript
import {
  SmokeTestReporter,
  runSmokeTest,
} from "./common/utils/smoke-test-reporter.util";

const reporter = new SmokeTestReporter(
  "production",
  "https://api. RustAcademy.io",
);
reporter.start();

await runSmokeTest(reporter, "Health check", "health", async () => {
  // Test implementation
});

const report = reporter.generateReport();
console.log(reporter.formatConsoleOutput());
```

## Acceptance Criteria

✅ **Deployments fail fast when a critical dependency is misconfigured**

- Critical tests block deployment on failure
- Immediate feedback in CI logs
- Deployment status updated with test results

✅ **Smoke results are visible in CI logs and easy to interpret**

- Formatted console output with clear pass/fail indicators
- GitHub Actions summary with test details
- Categorized results (health, network, links, etc.)

✅ **Tests do not require secrets beyond standard deployment credentials**

- Uses standard environment variables
- No additional API keys or secrets required
- Leverages existing deployment configuration

## Troubleshooting

### Tests Fail on Deployment

1. Check deployment logs for startup errors
2. Verify environment variables are set correctly
3. Check external service status (Supabase, Horizon, Soroban RPC)
4. Review network connectivity

### Timeout Errors

- Increase test timeout in workflow: `--testTimeout=60000`
- Check network latency to external services
- Verify service availability

### Dependency Issues

- Ensure all services are running (Supabase, Horizon, Soroban RPC)
- Check database migrations are applied
- Verify network configuration matches environment

## Maintenance

### Adding New Tests

1. Add test to appropriate file (`smoke.e2e-spec.ts` or `smoke-soroban-horizon.e2e-spec.ts`)
2. Categorize test appropriately
3. Add performance benchmark if applicable
4. Update documentation

### Updating Thresholds

- Modify performance thresholds in test files
- Update CI workflow timeout values
- Document reason for changes

### Critical Test Updates

- Review critical test keywords in `smoke-test-reporter.util.ts`
- Add new critical categories as needed
- Update acceptance criteria documentation

## Best Practices

1. **Keep tests fast** - Smoke tests should complete within 2-3 minutes
2. **Test critical paths** - Focus on essential functionality
3. **Clear error messages** - Help diagnose failures quickly
4. **Idempotent** - Tests should be safe to run multiple times
5. **Environment-agnostic** - Tests should work across all environments
