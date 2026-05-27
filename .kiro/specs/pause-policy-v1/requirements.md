# Requirements Document

## Introduction

The Pause Policy v1 feature introduces a structured, two-tier operational mode system for the QuickEx backend: **Paused** and **Emergency**. In normal operation all entry points are accessible. In Paused mode, risky write operations are blocked while reads and safe recovery paths remain open. In Emergency mode, only an explicit allowlist of fund-recovery entry points (refund initiation/approval/rejection and fiat withdrawal) remains accessible — all other entry points are blocked. A dedicated `PausePolicy` module acts as the single source of truth for the current mode, enforces the allowlist, emits structured events on every mode transition, and integrates with the existing audit log. All modules that expose write operations must delegate their mode check to `PausePolicy` rather than implementing their own flags.

## Glossary

- **PausePolicy**: The NestJS service and module responsible for storing, enforcing, and broadcasting the system's operational mode.
- **OperationalMode**: An enumeration of the three possible system states: `normal`, `paused`, and `emergency`.
- **Safe_Path**: An entry point that is permitted to execute in all operational modes, including emergency. The initial allowlist is: `POST /admin/refunds`, `POST /admin/refunds/:id/approve`, `POST /admin/refunds/:id/reject`, and `POST /fiat-ramps/withdraw`.
- **Risky_Entry_Point**: Any write-mutating entry point not on the Safe_Path allowlist. Examples include: transaction compose, bulk link generation, recurring payment creation/update, marketplace listing/bidding/accepting, and fiat deposit.
- **Mode_Transition_Event**: A structured event emitted by `PausePolicy` whenever the operational mode changes, containing the previous mode, new mode, reason, actor, and timestamp.
- **Actor**: The identifier of the admin API key or system process that triggered a mode change.
- **Emergency_Guard**: A NestJS guard or interceptor that consults `PausePolicy` before allowing a request to proceed.
- **Audit_Log**: The existing `AuditService` used to persist a durable record of every mode change.

---

## Requirements

### Requirement 1: Operational Mode Management

**User Story:** As a platform operator, I want to set the system to paused or emergency mode, so that I can halt risky operations during an incident without losing the ability to recover funds.

#### Acceptance Criteria

1. THE `PausePolicy` SHALL maintain the current `OperationalMode` with an initial value of `normal`.
2. WHEN an authorized actor calls the mode-change endpoint with a valid `OperationalMode` value and a non-empty reason string, THE `PausePolicy` SHALL update the current mode to the requested value.
3. IF the mode-change request is made without a valid admin API key, THEN THE `PausePolicy` SHALL reject the request with HTTP 401 Unauthorized; IF the request carries a valid API key that lacks the `pause_policy:write` scope, THEN THE `PausePolicy` SHALL reject the request with HTTP 403 Forbidden.
4. IF the mode-change request omits the reason string or provides an empty reason string, THEN THE `PausePolicy` SHALL reject the request with HTTP 400 and an error code of `REASON_REQUIRED`.
5. THE `PausePolicy` SHALL persist the current mode and reason to the Supabase store so that the mode survives a service restart.
6. WHEN the service starts, THE `PausePolicy` SHALL read the persisted mode from the Supabase store and restore it as the active mode; IF the store is unavailable, THE `PausePolicy` SHALL default to `normal` mode and log a warning.

---

### Requirement 2: Emergency Mode Allowlist Enforcement

**User Story:** As a platform operator, I want only explicitly safe entry points to remain accessible during emergency mode, so that users can recover their funds while all risky state transitions are blocked.

#### Acceptance Criteria

1. WHILE the `OperationalMode` is `emergency`, THE `Emergency_Guard` SHALL permit requests only to `Safe_Path` entry points.
2. WHILE the `OperationalMode` is `emergency`, WHEN a request arrives at a `Risky_Entry_Point`, THE `Emergency_Guard` SHALL reject the request with HTTP 503 and error code `EMERGENCY_MODE_ACTIVE`.
3. THE `PausePolicy` SHALL expose a method `isSafePath(routeKey: string): boolean` that returns `true` for each entry in the Safe_Path allowlist and `false` for all other route keys.
4. THE `PausePolicy` SHALL define the Safe_Path allowlist as a named constant so that it can be referenced in tests without duplication.
5. FOR ALL route keys not present in the Safe_Path allowlist, `isSafePath` SHALL return `false` regardless of the current `OperationalMode`.

---

### Requirement 3: Paused Mode Enforcement

**User Story:** As a platform operator, I want to block risky write operations in paused mode while keeping read operations and safe paths available, so that I can investigate an issue without fully locking down the platform.

#### Acceptance Criteria

1. WHILE the `OperationalMode` is `paused`, WHEN a request arrives at a `Risky_Entry_Point`, THE `Emergency_Guard` SHALL reject the request with HTTP 503 and error code `SYSTEM_PAUSED`.
2. WHILE the `OperationalMode` is `paused`, THE `Emergency_Guard` SHALL permit requests to all read-only (HTTP GET) entry points.
3. WHILE the `OperationalMode` is `paused`, THE `Emergency_Guard` SHALL permit requests to all `Safe_Path` entry points.
4. WHILE the `OperationalMode` is `normal`, THE `Emergency_Guard` SHALL permit requests to all entry points without restriction.

---

### Requirement 4: Mode Transition Events

**User Story:** As a platform operator, I want the system to emit a structured event every time the operational mode changes, so that downstream consumers and monitoring systems can react in real time.

#### Acceptance Criteria

1. WHEN the `OperationalMode` transitions from any value to any other value, THE `PausePolicy` SHALL emit a `Mode_Transition_Event` via the NestJS `EventEmitter` with event name `pause_policy.mode_changed`.
2. THE `Mode_Transition_Event` SHALL contain the fields: `previousMode` (`OperationalMode`), `newMode` (`OperationalMode`), `reason` (string), `actor` (string), and `occurredAt` (ISO 8601 timestamp string).
3. WHEN the `OperationalMode` transitions, THE `PausePolicy` SHALL write a record to the `AuditService` with action `pause_policy.mode_changed`, target equal to the new mode, and metadata containing the full `Mode_Transition_Event` payload.
4. IF the `AuditService` call fails, THEN THE `PausePolicy` SHALL log a warning and continue without throwing, so that the mode change is not rolled back due to an audit failure; all other failures during a mode transition SHALL be allowed to propagate and block the change.

---

### Requirement 5: Safe Path Accessibility During Emergency

**User Story:** As a user with funds locked in the platform, I want to be able to initiate and complete a refund or fiat withdrawal even during an emergency, so that I am not prevented from recovering my funds.

#### Acceptance Criteria

1. WHILE the `OperationalMode` is `emergency`, WHEN a request is made to `POST /admin/refunds`, THE `Emergency_Guard` SHALL allow the request to proceed to the `RefundsService`.
2. WHILE the `OperationalMode` is `emergency`, WHEN a request is made to `POST /admin/refunds/:id/approve`, THE `Emergency_Guard` SHALL allow the request to proceed to the `RefundsService`.
3. WHILE the `OperationalMode` is `emergency`, WHEN a request is made to `POST /admin/refunds/:id/reject`, THE `Emergency_Guard` SHALL allow the request to proceed to the `RefundsService`.
4. WHILE the `OperationalMode` is `emergency`, WHEN a request is made to `POST /fiat-ramps/withdraw`, THE `Emergency_Guard` SHALL allow the request to proceed to the `FiatRampsService`.
5. WHILE the `OperationalMode` is `emergency`, WHEN a request is made to any `Risky_Entry_Point` (including `POST /transactions/compose`, `POST /links/bulk/generate`, `POST /links/recurring`, `POST /marketplace/list`, `POST /marketplace/:id/bid`, `POST /marketplace/:id/accept-bid/:bidId`, and `POST /fiat-ramps/deposit`), THE `Emergency_Guard` SHALL reject the request with HTTP 503 and error code `EMERGENCY_MODE_ACTIVE`.

---

### Requirement 6: Module Integration

**User Story:** As a backend engineer, I want all modules to use a single shared `PausePolicy` service for mode enforcement, so that there is no risk of inconsistent behavior across modules.

#### Acceptance Criteria

1. THE `PausePolicyModule` SHALL be registered as a global module so that `PausePolicy` can be injected into any other module without explicit imports.
2. THE `Emergency_Guard` SHALL be implemented as a NestJS guard that injects `PausePolicy` and is applied globally via `APP_GUARD` in `AppModule`.
3. THE `Emergency_Guard` SHALL skip enforcement by default for all routes; WHEN the guard is registered globally via `APP_GUARD`, THE `Emergency_Guard` SHALL enforce pause policy only for routes explicitly marked with `@EnforcePausePolicy()`; IF the guard is not registered globally, THE `Emergency_Guard` SHALL skip enforcement for all routes regardless of any route-level decorators.
4. THE `PausePolicy` SHALL expose a `getCurrentMode(): Promise<OperationalMode>` method that all guards and services can call to read the current mode without side effects.

---

### Requirement 7: Admin API for Mode Control

**User Story:** As a platform operator, I want a dedicated admin API endpoint to read and change the operational mode, so that I can manage incidents programmatically or via tooling.

#### Acceptance Criteria

1. THE `PausePolicyController` SHALL expose `GET /admin/pause-policy/mode` which returns the current `OperationalMode`, the current reason, the actor who last changed it, and the timestamp of the last change.
2. THE `PausePolicyController` SHALL expose `POST /admin/pause-policy/mode` which accepts a body containing `mode` (`OperationalMode`) and `reason` (string) and updates the operational mode.
3. WHEN a request is made to `POST /admin/pause-policy/mode` without a valid API key, THE `PausePolicyController` SHALL return HTTP 401 Unauthorized; WHEN a request is made with a valid API key that lacks the `pause_policy:write` scope, THE `PausePolicyController` SHALL return HTTP 403 Forbidden.
4. WHEN a request is made to `GET /admin/pause-policy/mode` without a valid API key, THE `PausePolicyController` SHALL return HTTP 401 Unauthorized; WHEN a request is made with a valid API key that lacks the `pause_policy:read` scope, THE `PausePolicyController` SHALL return HTTP 403 Forbidden.
5. THE `PausePolicyController` SHALL return HTTP 200 with the updated mode record after a successful mode change.

---

### Requirement 8: Test Coverage

**User Story:** As a backend engineer, I want every entry point to be tested under normal, paused, and emergency modes, so that regressions in pause policy enforcement are caught automatically.

#### Acceptance Criteria

1. THE test suite SHALL include a unit test for `PausePolicy.isSafePath` that verifies every entry in the Safe_Path allowlist returns `true` and a representative set of `Risky_Entry_Point` route keys returns `false`.
2. THE test suite SHALL include a property-based test that, for any string not in the Safe_Path allowlist, `isSafePath` returns `false`.
3. THE test suite SHALL include a property-based test that, for any `Risky_Entry_Point` route key and any non-`normal` `OperationalMode`, the `Emergency_Guard` blocks the request.
4. THE test suite SHALL include example-based tests for each `Safe_Path` entry point verifying it succeeds under `emergency` mode.
5. THE test suite SHALL include example-based tests for each `Risky_Entry_Point` verifying it is blocked under both `paused` and `emergency` modes.
6. THE test suite SHALL include a test verifying that a `Mode_Transition_Event` is emitted with the correct payload on every mode change.
7. THE test suite SHALL include a test verifying that the `AuditService` is called with the correct action and metadata on every mode change.
