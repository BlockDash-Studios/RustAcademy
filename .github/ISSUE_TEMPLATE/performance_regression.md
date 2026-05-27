---
name: Performance Regression
about: Report a performance regression detected by the benchmark suite
title: '[PERF] Performance regression in [flow name]'
labels: performance, regression, priority-high
assignees: ''
---

## Performance Regression Detected

**Flow Name:** [e.g., Create/Fulfill Flow]

**Benchmark Test:** [e.g., `perf_bench_create_fulfill_flow`]

**CI Run:** [Link to GitHub Actions run]

## Metrics

### CPU Instructions

- **Current:** [e.g., 2,420,000]
- **Threshold:** [e.g., 2,200,000]
- **Exceeded by:** [e.g., 10.00%]

### Memory Bytes

- **Current:** [e.g., 380,000]
- **Threshold:** [e.g., 350,000]
- **Exceeded by:** [e.g., 8.57%]

## Context

**PR/Commit:** [Link to the PR or commit that introduced the regression]

**Branch:** [e.g., feature/new-validation]

**Date Detected:** [e.g., 2026-05-27]

## Suspected Cause

[Describe what changes might have caused the regression]

## Benchmark Output

```
[Paste the relevant benchmark output here]
```

## Impact Assessment

- [ ] Critical - Blocks deployment
- [ ] High - Should be fixed before merge
- [ ] Medium - Should be optimized soon
- [ ] Low - Minor increase, acceptable

## Proposed Solution

[Describe potential approaches to fix the regression]

## Additional Context

[Any other relevant information, profiling data, or analysis]

## Checklist

- [ ] Verified regression is reproducible locally
- [ ] Identified the specific commit/PR that introduced the regression
- [ ] Analyzed the root cause
- [ ] Proposed optimization approach
- [ ] Estimated effort to fix
