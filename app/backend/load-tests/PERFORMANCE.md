# Performance Optimization & Load Testing Guide

## Overview

This document describes the load testing and performance optimization measures implemented in Wave 3 of the QuickEx backend to ensure the system can handle expected traffic growth with <100ms response time under 100 concurrent users.

## Performance Optimizations Implemented

### 1. Response Compression

Response compression has been enabled in [`src/main.ts`](app/backend/src/main.ts) using the `compression` middleware:

```typescript
// Enable response compression for better performance
app.use(compression());
```

**Benefits:**
- Reduces bandwidth usage by 60-80% for JSON responses
- Faster response delivery to clients
- Lower network latency

### 2. Caching Service

A new global caching service has been implemented in [`src/common/services/cache.service.ts`](app/backend/src/common/services/cache.service.ts) using LRU (Least Recently Used) caching.

**Cache Instances:**
| Cache Name | Max Items | TTL | Use Case |
|------------|-----------|-----|----------|
| apiKeyCache | 500 | 5 min | API key lookups |
| userPreferencesCache | 1000 | 15 min | User notification preferences |
| assetCache | 100 | 1 hour | Asset definitions |
| transactionCountCache | 1000 | 1 min | Transaction counts |
| generalCache | 200 | 5 min | General purpose |

### 3. Database Query Optimizations

SQL indexes for performance have been documented in [`load-tests/database-perf-optimization.sql`](app/backend/load-tests/database-perf-optimization.sql).

**Key Indexes:**
- `idx_recurring_links_due_execution` - For fetching links due for execution
- `idx_recurring_links_owner_status` - For listing links by owner
- `idx_api_keys_key_hash` - For fast API key lookups
- `idx_notification_preferences_user` - For user notification preferences

### 4. HTTP Security Headers

Helmet middleware is already configured for security headers in [`src/main.ts`](app/backend/src/main.ts).

## Load Testing Setup

### Prerequisites

1. Install k6 load testing tool:
   ```bash
   # macOS
   brew install k6
   
   # Linux
   sudo apt-get install k6
   
   # Windows (using Chocolatey)
   choco install k6
   ```

2. Ensure the backend server is running:
   ```bash
   cd app/backend
   pnpm install
   pnpm run build
   node dist/main.js
   ```

### Running Load Tests

**Option 1: Using the k6 script directly**
```bash
cd app/backend
k6 run load-tests/load-test.js
```

**Option 2: With environment variables**
```bash
BASE_URL=http://localhost:4000 \
API_KEY=your-test-api-key \
k6 run load-tests/load-test.js
```

**Option 3: Using the CI workflow**

Navigate to GitHub Actions and run the "Backend Load Testing" workflow with:
- `test_type`: load (or stress/spike)
- `duration`: 5 (minutes)
- `target_vus`: 100

### Understanding Results

The load test script outputs a summary with:

```
Load Test Results Summary
==================================================

Total Requests: 12345
Request Rate: 102.5 req/s

Response Times (ms):
  Average: 45.2
  P95: 78.5
  P99: 120.3

Links Endpoint P95: 75.2 ms
Transactions Endpoint P95: 81.5 ms

✓ PASSED: <100ms requirement met
```

**Acceptance Criteria:**
- P95 response time < 100ms for all endpoints
- Error rate < 1%
- P99 response time < 200ms

## CI/CD Integration

### GitHub Actions Workflow

The [`load-test.yml`](.github/workflows/load-test.yml) workflow provides:

1. **Manual Trigger**: Run load tests on-demand with configurable parameters
2. **Automated Checks**: Verifies performance requirements are met
3. **Results Artifacts**: Uploads detailed test results for analysis

### Backend CI Workflow Updates

The [`backend.yml`](.github/workflows/backend.yml) workflow now includes:
- Type checking (`pnpm run type-check`)
- Lint verification
- Build verification

## Performance Monitoring

### Key Metrics to Monitor

1. **Response Time**
   - P50 (median)
   - P95 (95th percentile)
   - P99 (99th percentile)

2. **Request Rate**
   - Requests per second
   - Peak concurrent connections

3. **Error Rate**
   - HTTP 5xx errors
   - Timeout errors
   - Connection failures

4. **Resource Usage**
   - CPU utilization
   - Memory usage
   - Database connection pool

### Supabase Performance Tips

1. **Connection Pooling**: Configure connection pool size based on workload (20-50 connections)
2. **Query Timeouts**: Set appropriate timeouts (30s for regular, 5min for batch)
3. **Index Maintenance**: Regularly review and optimize indexes
4. **Cache Strategy**: Use cache headers for frequently accessed data

## Troubleshooting

### High Response Times

1. Check database query performance with `EXPLAIN ANALYZE`
2. Review Supabase dashboard for slow queries
3. Verify cache hit rates
4. Check for connection pool exhaustion

### High Error Rates

1. Review application logs
2. Check Sentry for error details
3. Verify Supabase service health
4. Check network connectivity

## Future Enhancements

1. **Redis Integration**: For distributed caching across multiple instances
2. **Database Read Replicas**: For scaling read operations
3. **CDN Integration**: For static asset caching
4. **GraphQL Subscriptions**: For real-time updates