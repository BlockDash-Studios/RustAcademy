# Testnet Reset & Reindex - Quick Reference

## What Was Built

### 1. Testnet Reset Service ✅
- **File**: `src/ingestion/testnet-reset.service.ts`
- **Purpose**: Safely wipe testnet event data and reinitialize checkpoints
- **Safeguards**: 
  - ✅ Blocked on mainnet
  - ✅ Audit logged
  - ✅ Metrics recorded
- **Endpoint**: `POST /admin/testnet/reset` (admin-only)

### 2. Testnet Reindex Handler ✅
- **File**: `src/job-queue/handlers/testnet-reindex.handler.ts`
- **Purpose**: Background job for reindexing Soroban events
- **Type**: `JobType.TESTNET_REINDEX`
- **Safeguards**:
  - ✅ Blocked on mainnet with `PermanentJobError`
  - ✅ Retryable on transient errors
  - ✅ Audit logged
  - ✅ Metrics recorded

### 3. Comprehensive Tests ✅
- **Unit Tests**: 32+ tests across 3 files
- **Integration Tests**: Workflow validation
- **Coverage**:
  - ✅ Environment validation
  - ✅ Happy path operations
  - ✅ Error scenarios
  - ✅ Audit logging
  - ✅ Metrics recording

### 4. Metrics Added ✅
- `testnet_reset_total` (counter)
- `testnet_reindex_total` (counter)
- `testnet_reset_records_removed` (histogram)
- `testnet_checkpoints_reset` (histogram)

### 5. Documentation ✅
- `TESTNET_RESET_REINDEX_GUIDE.md`: Comprehensive operational guide
- `IMPLEMENTATION_SUMMARY.md`: Complete change summary

## Acceptance Criteria Status

| # | Criteria | Status | How |
|---|----------|--------|-----|
| 1 | Reset only on testnet, blocked on mainnet | ✅ | `ForbiddenException` in service, `PermanentJobError` in handler |
| 2 | Deterministic reindex results | ✅ | Idempotent upserts with unique constraints |
| 3 | Quick validation of completion | ✅ | `TestnetResetResult` with counts, audit log ID, timestamp |

## File Changes Summary

### New Files (9 total)
```
src/ingestion/testnet-reset.service.ts                    [250 lines]
src/ingestion/testnet-reset.service.unit.spec.ts          [250 lines]
src/job-queue/handlers/testnet-reindex.handler.ts         [180 lines]
src/job-queue/handlers/testnet-reindex.handler.unit.spec.ts [230 lines]
src/ingestion/soroban-indexer.controller.unit.spec.ts     [180 lines]
src/auth/decorators/actor-public-key.decorator.ts         [30 lines]
test/testnet-reset-reindex.integration.spec.ts            [100 lines]
TESTNET_RESET_REINDEX_GUIDE.md                            [300+ lines]
IMPLEMENTATION_SUMMARY.md                                 [300+ lines]
```

### Modified Files (8 total)
```
src/metrics/metrics.service.ts                    [+50 lines]
src/job-queue/types/job.types.ts                 [+1 line]
src/job-queue/types/job-payloads.types.ts        [+15 lines]
src/job-queue/types/index.ts                     [+1 line]
src/job-queue/handlers/index.ts                  [+1 line]
src/job-queue/job-queue.module.ts                [+5 lines]
src/ingestion/ingestion.module.ts                [+10 lines]
src/ingestion/soroban-indexer.controller.ts      [+60 lines]
```

## API Quick Start

### Reset Testnet
```bash
curl -X POST http://localhost:3000/admin/testnet/reset \
  -H "x-api-key: <admin-key>" \
  -H "Content-Type: application/json"
```

### Response (Success)
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

### Response (Error - Mainnet)
```json
{
  "message": "ERROR: Running on mainnet — testnet data reset is blocked for safety",
  "error": "Forbidden",
  "statusCode": 403
}
```

### Reindex via Job Queue
```bash
curl -X POST http://localhost:3000/admin/jobs \
  -H "x-api-key: <admin-key>" \
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

## Testing

```bash
# Run unit tests
npm run test:unit -- testnet-reset

# Run all testnet tests
npm run test:unit -- --testPathPattern="testnet"

# Run integration tests (testnet only)
STELLAR_NETWORK=testnet npm run test:int
```

## Environment Checks

- ✅ Testnet environment validation
- ✅ Mainnet blocking with clear error message
- ✅ Network detection from `STELLAR_NETWORK` env var
- ✅ Works with existing infrastructure

## Audit & Logging

All operations logged to `admin_audit_logs`:
- `actor`: API key identifier
- `action`: `testnet_reset`, `testnet_reset_failed`, `testnet_reindex_completed`, `testnet_reindex_failed_mainnet`
- `metadata`: Operation details, counts, results
- `request_id`: Audit log ID for tracing

## Metrics

Prometheus-compatible metrics for monitoring:
- Operation counts by status
- Data volumes processed
- Success/failure rates

Access at: `http://localhost:9090/metrics` (if Prometheus configured)

## Key Features

| Feature | Implemented | Tested | Documented |
|---------|------------|--------|------------|
| Testnet-only reset | ✅ | ✅ | ✅ |
| Mainnet blocking | ✅ | ✅ | ✅ |
| Audit logging | ✅ | ✅ | ✅ |
| Metrics collection | ✅ | ✅ | ✅ |
| Idempotent operations | ✅ | ✅ | ✅ |
| Error handling | ✅ | ✅ | ✅ |
| Job queue integration | ✅ | ✅ | ✅ |
| Deterministic reindex | ✅ | ✅ | ✅ |

## Integration Checklist

- [ ] Review all new code
- [ ] Review all test files
- [ ] Run full test suite locally
- [ ] Deploy to staging
- [ ] Test reset on staging testnet
- [ ] Test reindex on staging testnet
- [ ] Verify audit logs
- [ ] Verify metrics appear
- [ ] Deploy to production
- [ ] Update operational runbook
- [ ] Train team on procedures

## Support

- **Operational Guide**: See `TESTNET_RESET_REINDEX_GUIDE.md`
- **Implementation Details**: See `IMPLEMENTATION_SUMMARY.md`
- **Code Examples**: See test files
- **API Docs**: See controller documentation

---

**Status**: ✅ Complete and Ready for Integration
**Test Coverage**: 32+ unit tests + integration tests
**Documentation**: Comprehensive (2 main guides + inline comments)
