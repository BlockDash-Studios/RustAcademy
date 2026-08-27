# Token Clock-Skew Policy

**BA-023** — Allowed JWT clock skew is explicit, bounded, and tested; operational
documentation explains synchronization requirements.

## Problem

JWT `exp` (expiry) and `nbf` (not-before) claims are absolute timestamps compared
against the *verifier's* wall clock (`Date.now()`). Distributed systems do not have
a single clock: if the verifying node's clock runs ahead of the signing node's,
a freshly issued token can appear *already expired*; if the verifier's clock runs
behind, a genuinely expired token can still be accepted. Both failure modes are
introduced solely by clock drift, not by the token itself.

## Policy

- **Explicit:** The allowed tolerance is a single named configuration value,
  `JWT_CLOCK_SKEW_SECONDS` (default `30` seconds).
- **Bounded:** Config validation (`src/config/config.module.ts`) bounds the value
  to an integer in `[0, 120]`. Values outside this range are **rejected at startup**,
  so the window cannot be widened accidentally or adversarially.
- **Applied at verification:** The value is wired into `verifyOptions.clockTolerance`
  of `@nestjs/jwt` in `src/auth/auth.module.ts`, so every guard
  (`JwtLearnerGuard`, `JwtTutorGuard`, `JwtAdminGuard`) uses the same policy.
- **Tested:** `src/auth/jwt-clock-skew.spec.ts` drives Jest fake timers to prove
  the boundaries, and `src/config/jwt-clock-skew.config.spec.ts` locks the bounds.

### Effect of `clockTolerance`

Verification treats a token as valid while:

```
now <= exp + clockTolerance    // token not yet expired (within tolerance)
now >= nbf - clockTolerance    // token not-before is not "too far in the future"
```

So a token that has only just expired is still accepted (preventing premature
expiry from a slightly-ahead verifier), while a token long past expiry is rejected.

> Note: `clockTolerance` is a `VerifyOptions` flag in `jsonwebtoken`/`@nestjs/jwt`.
> `nbf` is validated with the same tolerance via the runtime, and both `exp` and
> `nbf` failing checks raise `TokenExpiredError`/`NotBeforeError` respectively.

## Operational Guidance — Clock Synchronization

The 30s default tolerance is a **safety margin against clock drift**, not a
substitute for keeping clocks accurate. Follow these requirements:

1. **NTP everywhere.** Every node that signs or verifies JWTs
   (API server, worker/Redis consumers, any trust boundary peer) must run an
   NTP (or on Windows, W32Time) client synchronised to a reliable time source.

2. **Target drift well under the tolerance.** Configure NTP so that drift between
   any two nodes is bounded far below `JWT_CLOCK_SKEW_SECONDS`. As a rule of thumb,
   the **maximum expected inter-node skew should be no more than ~10s** — i.e. the
   tolerance should be *at least 3x* the worst-case drift, leaving headroom for
   network and NTP polling delays.

3. **Regularly validate drift.** Periodically run a clock-drift check across the
   fleet (e.g. `ntpdate -q`, `w32tm /stripchart`, or a fleet-wide `date`/NTP query)
   and alert when skew approaches the configured tolerance.

4. **Do not tune the tolerance up casually.** Widening `JWT_CLOCK_SKEW_SECONDS`
   directly increases the window in which an expired token is still accepted.
   Only raise it when real, verified inter-node drift demands it — and re-verify
   the NTP configuration first, since widening masks rather than fixes a clock
   problem.

5. **Keep symmetric.** All nodes verifying tokens should use the same
   `JWT_CLOCK_SKEW_SECONDS` value so behaviour is consistent across the fleet.

## Configuration

| Variable                | Default | Bounds       | Description                                             |
| ----------------------- | ------- | ------------ | ------------------------------------------------------- |
| `JWT_CLOCK_SKEW_SECONDS`| `30`    | integer 0–120| Seconds of clock tolerance on `exp`/`nbf` verification. |

## Related Files

- `BackendAcademy/src/config/config.module.ts` — bounded config schema.
- `BackendAcademy/src/auth/auth.module.ts` — wires `verifyOptions.clockTolerance`.
- `BackendAcademy/src/auth/jwt-clock-skew.spec.ts` — fake-timer behavior tests.
- `BackendAcademy/src/config/jwt-clock-skew.config.spec.ts` — bounds tests.
- `BackendAcademy/.env.example` — documented env surface.
