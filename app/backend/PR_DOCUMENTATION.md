# Pull Request: Testnet Reset and Soroban Event Reindexing Tooling

## Description

This PR implements comprehensive tooling to safely reset testnet data and reindex Soroban contract events for reproducible demos and contributor testing. All operations include environment safeguards to prevent mainnet data loss, audit logging, and metrics collection.

**Closes**: Task: Add tooling to reset testnet data and reindex Soroban events from a known checkpoint

---

## Changes

### Core Features

#### 1. Testnet Reset Service
- New service: `TestnetResetService` (`src/ingestion/testnet-reset.service.ts`)
- Safely truncates testnet-only event tables:
  - `escrow_events`
  - `privacy_events`
  - `admin_events`
  - `stealth_events`
- Resets all indexer checkpoints to `NULL` for clean reindex
- Blocks execution on mainnet with `ForbiddenException`
- Audit logs all reset operations with full metadata
- Records metrics for monitoring

**Usage**:
```typescript
const result = await testnetResetService.resetTestnetData(requesterPublicKey);
// Returns: TestnetResetResult with counts, audit log ID, timestamp
```

#### 2. Testnet Reindex Job Handler
- New job handler: `TestnetReindexHandler` (`src/job-queue/handlers/testnet-reindex.handler.ts`)
- Implements `JobHandler<TestnetReindexPayload>` for background processing
- Job type: `JobType.TESTNET_REINDEX`
- Validates testnet environment, throws `PermanentJobError` on mainnet
- Reprocesses Soroban contract events over configurable ledger range
- Idempotent - safe to run multiple times over same range
- Supports force-reprocessing to skip checkpoints
- Retryable on transient errors (maxAttempts=3)
- Full audit logging of completion and failures

**Payload**:
```typescript
interface TestnetReindexPayload {
  contractId: string;        // Soroban contract address
  fromLedger: number;        // Starting ledger sequence
  toLedger: number;          // Ending ledger sequence
  force: boolean;            // Force reprocessing even if checkpoint exists
  requesterPublicKey: string; // Actor performing the operation
}
```

#### 3. Actor Extraction Decorator
- New decorator: `@ActorPublicKey()` (`src/auth/decorators/actor-public-key.decorator.ts`)
- Extracts actor identifier from API key or organization context
- Falls back to "anonymous" for public requests
- Used for audit logging to track who performed operations

#### 4. API Endpoint
- New endpoint: `POST /admin/testnet/reset`
- Admin-only (requires `admin` scope)
- API key authentication required
- Returns `TestnetResetResult` with operation details:
  - `success`: boolean flag
  - `timestamp`: when operation completed
  - `truncatedTables`: count per table
  - `checkpointCount`: number of checkpoints reset
  - `auditLogId`: for finding operation in audit logs
  - `message`: human-readable summary

---

### Metrics Added

Four new Prometheus metrics for operational monitoring:

1. **`testnet_reset_total`** (Counter)
   - Total reset operations by status (success/failure)
   - Labels: `status`

2. **`testnet_reindex_total`** (Counter)
   - Total reindex operations by status
   - Labels: `status`

3. **`testnet_reset_records_removed`** (Histogram)
   - Number of event records removed per reset
   - Buckets: [10, 100, 1000, 10000, 100000]

4. **`testnet_checkpoints_reset`** (Histogram)
   - Number of checkpoints reset per operation
   - Buckets: [1, 5, 10, 50, 100]

---

### Audit Logging

All operations logged to `admin_audit_logs` table with:

- **Actor**: API key name or identifier
- **Action**: One of:
  - `testnet_reset` - successful reset
  - `testnet_reset_failed` - reset error
  - `testnet_reindex_completed` - successful reindex
  - `testnet_reindex_failed_mainnet` - mainnet block attempt
- **Target**: `testnet_data` or `contract:<contractId>`
- **Metadata**: Operation-specific details (counts, results, errors)
- **Request ID**: Unique audit log ID for tracing

---

### Environment Safeguards

#### Testnet-Only Operations
- Network detection from `STELLAR_NETWORK` environment variable
- Validation on service initialization
- Allowed values: `"testnet"` | `"mainnet"`

#### Mainnet Blocking
- Reset service throws `ForbiddenException` on mainnet
- Reindex handler throws `PermanentJobError` on mainnet (non-retryable)
- Clear error messages with safety context
- All blocked attempts audit logged

#### Error Handling
- Database errors wrapped in `InternalServerErrorException`
- Network timeouts trigger retries (job handler)
- Transient failures don't block audit logging
- All errors audit logged with failure action

---

## Acceptance Criteria

### ✅ Criterion 1: Reset Only on Testnet
**Status**: Met

- Service validates network and throws `ForbiddenException` if not testnet
- Handler validates network and throws `PermanentJobError` if not testnet
- API endpoint returns 403 Forbidden on mainnet
- All blocked attempts audit logged

**Test Coverage**: 
- `testnet-reset.service.unit.spec.ts` - Environment validation tests
- `testnet-reindex.handler.unit.spec.ts` - Mainnet blocking tests
- `soroban-indexer.controller.unit.spec.ts` - Authorization tests

### ✅ Criterion 2: Deterministic Reindex State
**Status**: Met

- Idempotent upserts with unique constraints prevent duplicates
- Multiple reindex runs over same range produce identical results
- Unknown schema versions tracked but don't cause failures
- Force parameter allows reprocessing of already-indexed ranges

**Test Coverage**:
- `testnet-reindex.handler.unit.spec.ts` - Ledger range handling
- `soroban-indexer.controller.unit.spec.ts` - Force parameter tests
- Integration tests validate consistency

### ✅ Criterion 3: Quick Completion Validation
**Status**: Met

- `TestnetResetResult` returns:
  - `success` flag for immediate status
  - `truncatedTables` with per-table counts
  - `checkpointCount` for quick validation
  - `auditLogId` to find operation in audit logs
  - `timestamp` for when operation completed
  - `message` with human-readable summary

**Example Response**:
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

---

## Testing

### Unit Tests (32+ test cases)

#### `src/ingestion/testnet-reset.service.unit.spec.ts` (9 tests)
- Environment validation (testnet vs mainnet)
- Successful reset operation
- Audit logging verification
- Metrics recording
- Database error handling
- Idempotent operations
- Result DTO validation

#### `src/job-queue/handlers/testnet-reindex.handler.unit.spec.ts` (11 tests)
- Mainnet blocking with `PermanentJobError`
- Testnet reindex execution
- Audit logging (success and failure)
- Metrics recording
- Force parameter handling
- Ledger range tracking
- Transient error handling
- Environment validation

#### `src/ingestion/soroban-indexer.controller.unit.spec.ts` (12 tests)
- Reset endpoint success responses
- Reset endpoint error handling
- Authorization and authentication
- Response format validation
- Multiple consecutive resets
- Reindex endpoint parameter passing
- Default value handling

### Integration Tests

#### `test/testnet-reset-reindex.integration.spec.ts`
- End-to-end reset workflow
- Environment-specific test execution (skips if not testnet)
- Acceptance criteria validation
- Deterministic reindex results
- Audit trail consistency

### Running Tests

```bash
# Run all unit tests
npm run test:unit

# Run specific service tests
npm run test:unit -- testnet-reset.service.unit.spec.ts
npm run test:unit -- testnet-reindex.handler.unit.spec.ts

# Run integration tests (testnet only)
STELLAR_NETWORK=testnet npm run test:int

# Run with coverage
npm run test:unit -- --coverage
```

---

## Files Changed

### New Files (10 total)

**Core Implementation**:
- `src/ingestion/testnet-reset.service.ts` (250 lines)
- `src/job-queue/handlers/testnet-reindex.handler.ts` (180 lines)
- `src/auth/decorators/actor-public-key.decorator.ts` (30 lines)

**Tests**:
- `src/ingestion/testnet-reset.service.unit.spec.ts` (250 lines)
- `src/job-queue/handlers/testnet-reindex.handler.unit.spec.ts` (230 lines)
- `src/ingestion/soroban-indexer.controller.unit.spec.ts` (180 lines)
- `test/testnet-reset-reindex.integration.spec.ts` (100 lines)

**Documentation**:
- `TESTNET_RESET_REINDEX_GUIDE.md` (comprehensive operational guide)
- `IMPLEMENTATION_SUMMARY.md` (technical details)
- `TESTNET_RESET_QUICKREF.md` (quick reference)

### Modified Files (8 total)

**Type Definitions**:
- `src/job-queue/types/job.types.ts` - Added `TESTNET_REINDEX` to `JobType` enum
- `src/job-queue/types/job-payloads.types.ts` - Added `TestnetReindexPayload` interface
- `src/job-queue/types/index.ts` - Exported new payload type

**Module Configuration**:
- `src/job-queue/handlers/index.ts` - Exported `TestnetReindexHandler`
- `src/job-queue/job-queue.module.ts` - Registered reindex handler
- `src/ingestion/ingestion.module.ts` - Registered reset service, added audit module

**Services**:
- `src/metrics/metrics.service.ts` - Added 4 new metrics + 3 recording methods (50 lines)
- `src/ingestion/soroban-indexer.controller.ts` - Added reset endpoint (60 lines)

---

## Usage

### Reset Testnet Data

```bash
curl -X POST http://localhost:3000/admin/testnet/reset \
  -H "x-api-key: qx_xxxxx" \
  -H "Content-Type: application/json"
```

**Success Response (200 OK)**:
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

**Error Response (403 Forbidden on mainnet)**:
```json
{
  "message": "ERROR: Running on mainnet — testnet data reset is blocked for safety",
  "error": "Forbidden",
  "statusCode": 403
}
```

### Queue Reindex Job

```bash
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

---

## Breaking Changes

**None**. All changes are additive:
- New service doesn't affect existing functionality
- New job type doesn't conflict with existing types
- New endpoint is admin-only and isolated
- Existing reindex endpoint unchanged

---

## Migration Guide

No migration required. The implementation:
- Uses existing tables (`escrow_events`, `privacy_events`, `admin_events`, `stealth_events`, `indexer_checkpoints`)
- Uses existing `admin_audit_logs` table for logging
- Uses existing authentication infrastructure
- Integrates with existing job queue system

---

## Deployment Checklist

- [ ] All tests passing locally
- [ ] Code review approved
- [ ] Deploy to staging
- [ ] Integration tests pass on testnet
- [ ] Verify reset endpoint works on staging
- [ ] Verify reindex jobs work on staging
- [ ] Check audit logs for operations
- [ ] Monitor metrics on Prometheus
- [ ] Deploy to production
- [ ] Update operational runbooks
- [ ] Train team on procedures

---

## Operational Considerations

### For Demos
```bash
# 1. Reset testnet data
curl -X POST http://localhost:3000/admin/testnet/reset \
  -H "x-api-key: <admin-key>"

# 2. Reindex to establish baseline state
curl -X POST http://localhost:3000/admin/jobs \
  -H "x-api-key: <admin-key>" \
  -d '{...testnet_reindex payload...}'

# 3. Demo is ready with reproducible state
```

### For Contributor Testing
- Operators can safely reset testnet between test runs
- Audit logs track all resets for compliance
- Metrics show operational patterns

### For Incident Recovery
- Reindex specific ledger ranges for reconciliation
- Force parameter allows reprocessing of suspected data issues
- Idempotent operations ensure data consistency

---

## Related Documentation

- **[Operational Guide](./TESTNET_RESET_REINDEX_GUIDE.md)** - Complete procedures and troubleshooting
- **[Implementation Summary](./IMPLEMENTATION_SUMMARY.md)** - Technical details and file-by-file changes
- **[Quick Reference](./TESTNET_RESET_QUICKREF.md)** - API examples and quick lookup

---

## Reviewers Checklist

- [ ] Environment safeguards properly implemented (testnet-only)
- [ ] Audit logging captures all operations
- [ ] Metrics are correct and useful
- [ ] Tests provide adequate coverage (32+ test cases)
- [ ] Error messages are clear and helpful
- [ ] No breaking changes to existing functionality
- [ ] Documentation is comprehensive
- [ ] Code follows project conventions
- [ ] Performance impact acceptable (truncation is fast)

---

## Questions?

See the documentation files or review the test files for usage examples and expected behavior.
