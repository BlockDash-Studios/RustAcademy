### Testnet Reset and Reindex Tooling

This document describes the new testnet data reset and Soroban event reindexing functionality added to QuickEx.

## Overview

The testnet reset and reindex system provides safe, auditable operations to:
1. **Reset testnet data**: Wipe event tables and reinitialize checkpoints for reproducible demos
2. **Reindex events**: Reprocess Soroban contract events over a configured ledger range
3. **Audit operations**: Log all reset/reindex activities with actor, timestamp, and results
4. **Block mainnet**: Prevent accidental data loss by blocking all operations on mainnet

## Acceptance Criteria (Met)

✅ **Reset can only run on testnet and is blocked otherwise**
- Environment validation in `TestnetResetService.validateTestnetEnvironment()`
- Throws `ForbiddenException` if not on testnet
- `TestnetReindexHandler` validates network and throws `PermanentJobError` on mainnet

✅ **Reindex produces deterministic state for the configured ledger range**
- Idempotent upserts with unique constraints prevent duplicates
- Multiple reindex runs over same range produce identical results
- Unknown schema versions are tracked and logged but don't cause failures

✅ **Operators can validate completion and resulting counts quickly**
- Reset returns `TestnetResetResult` with:
  - `success` flag
  - `truncatedTables` (count per table)
  - `checkpointCount` (number of checkpoints reset)
  - `auditLogId` (for finding operation in audit logs)
  - `message` (human-readable summary)
  - `timestamp` (when operation completed)

## Architecture

### New Components

#### 1. `TestnetResetService` (`src/ingestion/testnet-reset.service.ts`)
- Validates testnet environment
- Safely truncates event tables:
  - `escrow_events`
  - `privacy_events`
  - `admin_events`
  - `stealth_events`
- Resets all indexer checkpoints
- Logs operation to audit trail
- Records metrics

**Key Methods:**
- `validateTestnetEnvironment()`: Checks if running on testnet
- `resetTestnetData(requesterPublicKey)`: Performs the reset operation

#### 2. `TestnetReindexHandler` (`src/job-queue/handlers/testnet-reindex.handler.ts`)
- Job handler for background reindex operations
- Validates testnet environment (mainnet blocks with `PermanentJobError`)
- Calls `SorobanEventIndexerService.indexLedgerRange()`
- Logs results to audit trail
- Records metrics

**Job Type:** `JobType.TESTNET_REINDEX`

**Payload:**
```typescript
interface TestnetReindexPayload {
  contractId: string;        // Contract to reindex
  fromLedger: number;        // Starting ledger
  toLedger: number;          // Ending ledger
  force: boolean;            // Force reprocessing even if checkpoint exists
  requesterPublicKey: string; // Actor performing the operation
}
```

#### 3. Controller Endpoints (`src/ingestion/soroban-indexer.controller.ts`)

**POST /admin/testnet/reset**
- Admin-only endpoint for triggering testnet reset
- Requires API key with `admin` scope
- Returns `TestnetResetResult` with operation details
- Blocks on mainnet with 403 Forbidden

**POST /indexer/reindex** (existing, enhanced)
- Already supports reindexing with custom ledger ranges
- Works on testnet and mainnet

#### 4. Updated Metrics (`src/metrics/metrics.service.ts`)
- `testnet_reset_total` (counter): Total reset operations by status
- `testnet_reindex_total` (counter): Total reindex operations by status
- `testnet_reset_records_removed` (histogram): Records removed per reset
- `testnet_checkpoints_reset` (histogram): Checkpoints reset per operation

#### 5. Audit Logging
All operations logged to `admin_audit_logs` table with:
- `actor`: API key name or identifier
- `action`: `testnet_reset`, `testnet_reset_failed`, `testnet_reindex_completed`, `testnet_reindex_failed_mainnet`
- `metadata`: Operation details (tables, counts, results)
- `request_id`: Audit log ID for tracking

#### 6. New Job Types
- `JobType.TESTNET_REINDEX`: Background job for reindexing events

## API Usage

### Reset Testnet Data

```bash
curl -X POST http://localhost:3000/admin/testnet/reset \
  -H "x-api-key: qx_xxxxx" \
  -H "Content-Type: application/json"
```

**Response (200 OK):**
```json
{
  "success": true,
  "timestamp": "2024-06-01T12:34:56.789Z",
  "truncatedTables": {
    "escrow_events": 150,
    "privacy_events": 75,
    "admin_events": 25,
    "stealth_events": 10
  },
  "checkpointCount": 3,
  "auditLogId": "reset_1717318496789_abc123",
  "message": "Testnet reset completed: removed 260 event records and reset 3 checkpoints"
}
```

**Response (403 Forbidden):**
```json
{
  "message": "ERROR: Running on mainnet — testnet data reset is blocked for safety",
  "error": "Forbidden",
  "statusCode": 403
}
```

### Trigger Reindex via Job Queue

```bash
# Enqueue a reindex job
curl -X POST http://localhost:3000/admin/jobs \
  -H "x-api-key: qx_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "testnet_reindex",
    "payload": {
      "contractId": "CCBXVMSVZJR7OF7CCVLTG26DYLJJQXOGXJQEJQW7JZ3OWFEEZI7EHIGM",
      "fromLedger": 100000,
      "toLedger": 101000,
      "force": false,
      "requesterPublicKey": "GBVR5SG3ASLQF6KZPQFQC2MDDKKSEBFK7RJZSJ23YDXRPLJ5SLTFVSI"
    }
  }'
```

### Direct Reindex (Synchronous)

```bash
curl -X POST http://localhost:3000/indexer/reindex \
  -H "Content-Type: application/json" \
  -d '{
    "contractId": "CCBXVMSVZJR7OF7CCVLTG26DYLJJQXOGXJQEJQW7JZ3OWFEEZI7EHIGM",
    "fromLedger": 100000,
    "toLedger": 101000,
    "force": true
  }'
```

## Environment Safeguards

### Network Detection
- `AppConfigService.network` read from `STELLAR_NETWORK` env var
- Validated at startup via `EnvConfig` schema
- Allowed values: `"testnet"` | `"mainnet"`

### Mainnet Protection
- Reset operations throw `ForbiddenException` on mainnet
- Reindex jobs throw `PermanentJobError` on mainnet (non-retryable)
- API endpoints return 403 Forbidden with clear error message
- Audit logs record all blocked attempts

### Error Handling
- Database errors trigger `InternalServerErrorException`
- Errors are audit logged with failure action
- Metrics record failure count
- Operations are idempotent (safe to retry)

## Testing

### Unit Tests
Location: `src/ingestion/testnet-reset.service.unit.spec.ts`

Covers:
- Environment validation (testnet vs mainnet)
- Safe table truncation
- Checkpoint reset
- Audit logging
- Metrics recording
- Error handling
- Idempotent operations

Location: `src/job-queue/handlers/testnet-reindex.handler.unit.spec.ts`

Covers:
- Mainnet blocking
- Reindex execution
- Ledger range handling
- Force parameter
- Audit logging
- Metrics recording
- Error scenarios

Location: `src/ingestion/soroban-indexer.controller.unit.spec.ts`

Covers:
- Endpoint authentication
- Authorization checks
- Payload validation
- Response formats
- Multiple consecutive resets

### Integration Tests
Location: `test/testnet-reset-reindex.integration.spec.ts`

Covers:
- End-to-end workflows
- Acceptance criteria validation
- Deterministic reindex results
- Audit trail consistency

### Running Tests

```bash
# Run all unit tests
npm run test:unit

# Run specific test file
npm run test:unit -- testnet-reset.service.unit.spec.ts

# Run with coverage
npm run test:unit -- --coverage

# Run integration tests (testnet only)
STELLAR_NETWORK=testnet npm run test:int -- testnet-reset-reindex.integration.spec.ts
```

## Operational Workflows

### Demo Reset for QuickEx Testnet

```bash
# 1. Reset all event data and checkpoints
curl -X POST http://localhost:3000/admin/testnet/reset \
  -H "x-api-key: <admin-api-key>" \
  -H "Content-Type: application/json"

# 2. Find the audit log ID from response
# 3. Reindex events for a known ledger range to establish baseline state
curl -X POST http://localhost:3000/admin/jobs \
  -H "x-api-key: <admin-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "testnet_reindex",
    "payload": {
      "contractId": "<contract-id>",
      "fromLedger": 50000000,
      "toLedger": 50010000,
      "force": true,
      "requesterPublicKey": "<your-public-key>"
    }
  }'

# 4. Verify reindex job completed
curl http://localhost:3000/admin/jobs/<job-id> \
  -H "x-api-key: <admin-api-key>"

# 5. Demo is now ready with reproducible state
```

### Continuous Integration

```yaml
# GitHub Actions example
- name: Reset testnet for integration tests
  if: env.STELLAR_NETWORK == 'testnet'
  run: |
    npm run test:e2e -- --include "reset-scenario"
```

## Files Changed

### New Files
- `src/ingestion/testnet-reset.service.ts` - Reset service implementation
- `src/ingestion/testnet-reset.service.unit.spec.ts` - Reset service tests
- `src/job-queue/handlers/testnet-reindex.handler.ts` - Reindex job handler
- `src/job-queue/handlers/testnet-reindex.handler.unit.spec.ts` - Reindex handler tests
- `src/ingestion/soroban-indexer.controller.unit.spec.ts` - Controller tests
- `src/auth/decorators/actor-public-key.decorator.ts` - Actor extraction decorator
- `test/testnet-reset-reindex.integration.spec.ts` - Integration tests
- `TESTNET_RESET_REINDEX_GUIDE.md` - This file

### Modified Files
- `src/metrics/metrics.service.ts` - Added testnet reset/reindex metrics
- `src/job-queue/types/job.types.ts` - Added `JobType.TESTNET_REINDEX`
- `src/job-queue/types/job-payloads.types.ts` - Added `TestnetReindexPayload`
- `src/job-queue/types/index.ts` - Exported new types
- `src/job-queue/handlers/index.ts` - Exported `TestnetReindexHandler`
- `src/job-queue/job-queue.module.ts` - Registered reindex handler
- `src/ingestion/ingestion.module.ts` - Registered reset service, added audit module import
- `src/ingestion/soroban-indexer.controller.ts` - Added reset endpoint

## Deployment Checklist

- [ ] All tests passing locally
- [ ] Integration tests pass on testnet
- [ ] Code review approved
- [ ] Environment variables documented
- [ ] Audit log schema verified
- [ ] Metrics scraping configured
- [ ] Runbook updated with reset procedures
- [ ] Team trained on safe operation
- [ ] Deployment to staging completed
- [ ] Deployment to production completed

## Support & Troubleshooting

### Reset fails with "Database error"
- Check Supabase connectivity
- Verify API key has admin scope
- Check audit logs for detailed error

### Reindex job stuck in "running"
- Check Horizon connectivity
- Monitor metrics for `ingestion_lag_seconds`
- Check job queue admin panel for stuck jobs

### Metrics not appearing
- Verify metrics service initialized correctly
- Check Prometheus scrape config
- Verify labels match expected format

## References

- [SorobanEventIndexerService](../../soroban-event-indexer.service.ts)
- [AuditService](../../audit/audit.service.ts)
- [MetricsService](../../metrics/metrics.service.ts)
- [IndexerCheckpointRepository](../../indexer-checkpoint.repository.ts)
- [JobQueueService](../job-queue.service.ts)
