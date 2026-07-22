# Feature Flags Architecture & Bootstrap Configuration

The Feature Flags module provides dynamic configuration and safety gates for runtime operations, environment checks, and mainnet guardrails.

## Resolution Chain & Fallback Priority

When evaluating feature flags, the system retrieves flag definitions following a 3-tier precedence hierarchy:

```
┌─────────────────────────────────────────────────────────┐
│ 1. Database Flag Store (Supabase `feature_flags` table) │
└────────────────────────────┬────────────────────────────┘
                             │ (Fallback when offline/error)
                             ▼
┌─────────────────────────────────────────────────────────┐
│ 2. Environment Bootstrap (`FEATURE_FLAGS_BOOTSTRAP_JSON`)│
└────────────────────────────┬────────────────────────────┘
                             │ (Fallback when empty/invalid)
                             ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Code Defaults (`DEFAULT_FLAGS` in service)           │
└─────────────────────────────────────────────────────────┘
```

1. **Database Store (`store`)**: Primary source of truth. When accessible, stored flags override bootstrap and code defaults. Cached for `FEATURE_FLAGS_CACHE_TTL_MS` (default: 15,000 ms).
2. **Environment Bootstrap (`bootstrap`)**: Configured via the `FEATURE_FLAGS_BOOTSTRAP_JSON` environment variable. Applied whenever the database store is unreachable or during cold boot offline mode.
3. **Code Defaults (`DEFAULT_FLAGS`)**: Hardcoded safe defaults built into `FeatureFlagsService` for critical network safety flags (`mainnet.refunds`, `mainnet.dispute_actions`, `mainnet.contract_writes`, etc.).

---

## Environment Variable Schema (`FEATURE_FLAGS_BOOTSTRAP_JSON`)

`FEATURE_FLAGS_BOOTSTRAP_JSON` allows ops engineers to supply initial flag states via environment variables.

### Joi Validation
The environment schema validates `FEATURE_FLAGS_BOOTSTRAP_JSON` at application startup:
- Must be valid JSON.
- Must deserialize into a JSON array (`[...]`).
- Each element must be an object containing a non-empty string `key`.

### Bootstrap Record Schema
```typescript
interface BootstrapFlagOverride {
  key: string;                 // Required. Unique identifier (e.g. "mainnet.refunds")
  name?: string;               // Optional display name (defaults to key)
  description?: string;        // Optional description
  enabled?: boolean;           // Default: false
  killSwitch?: boolean;        // Default: false
  rolloutPercentage?: number;  // Range: 0 - 100 (Default: 0)
  allowedUsers?: string[];     // User allowlist IDs
  environments?: string[];     // Allowed environments (e.g. ["production", "staging"])
  metadata?: Record<string, any>;
  updatedAt?: string;          // ISO timestamp
  updatedBy?: string;          // Defaults to "bootstrap"
}
```

### Example Environment Configuration
```json
[
  {
    "key": "mainnet.refunds",
    "enabled": false,
    "killSwitch": false,
    "rolloutPercentage": 0,
    "environments": ["production"]
  },
  {
    "key": "bulk_invoicing_v2",
    "enabled": true,
    "rolloutPercentage": 50,
    "environments": ["development", "test", "production"]
  }
]
```

---

## Typed Parsing & Error Reporting

The service centralizes bootstrap JSON parsing via `parseBootstrapFlags()`:
- **Valid Bootstrap**: Parsed overrides merge on top of `DEFAULT_FLAGS`. `bootstrapStatus.valid` is `true`.
- **Invalid JSON / Structure**: Safe fallbacks (`DEFAULT_FLAGS`) are loaded automatically. A warning is logged, and details are available via `bootstrapStatus.error`.

---

## Operational Monitoring & API Endpoints

### Administrative Endpoints

- `GET /admin/feature-flags`
  Returns all resolved flags along with `source` (`store`, `bootstrap`, or `cache`) and `storeAvailable` status.

- `GET /admin/feature-flags/operational-state`
  Returns system status, cache expiration, store availability, and bootstrap parsing health:

  ```json
  {
    "source": "store",
    "storeAvailable": true,
    "cacheExpiresAt": 1753200000000,
    "bootstrapStatus": {
      "valid": true,
      "parsedCount": 6,
      "hasCustomBootstrap": true
    }
  }
  ```

- `GET /admin/feature-flags/:key`
  Retrieves a specific feature flag by key.

- `PATCH /admin/feature-flags/:key`
  Updates a feature flag in the store and records an audit log entry.

### Evaluation Endpoint

- `GET /feature-flags/:key/evaluate?userId=usr_123&environment=production`
  Evaluates flag status based on kill switch, master enable, environment match, allowlist, and deterministic rollout percentage.
