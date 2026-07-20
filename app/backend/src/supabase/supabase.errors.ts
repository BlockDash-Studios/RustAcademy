export class SupabaseError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'SupabaseError';
  }
}

export class SupabaseUniqueConstraintError extends SupabaseError {
  constructor(message: string, details?: unknown) {
    super(message, '23505', details);
    this.name = 'SupabaseUniqueConstraintError';
  }
}

export class SupabaseNetworkError extends SupabaseError {
  constructor(message: string, details?: unknown) {
    super(message, 'NETWORK_ERROR', details);
    this.name = 'SupabaseNetworkError';
  }
}

/**
 * Raised when a Supabase/PostgREST request times out.
 *
 * Mapped from:
 *  - PostgreSQL error code 57014 (query_canceled / statement_timeout)
 *  - PostgREST error code PGRST504
 *  - Error messages containing "timeout" or "timed out"
 */
export class SupabaseTimeoutError extends SupabaseError {
  constructor(message: string, details?: unknown) {
    super(message, 'TIMEOUT', details);
    this.name = 'SupabaseTimeoutError';
  }
}

/**
 * Raised when the request is rejected due to an authentication or
 * authorisation failure.
 *
 * Mapped from:
 *  - PostgREST error codes PGRST301 (JWT expired) and PGRST302 (JWT invalid)
 *  - Supabase Auth error codes: invalid_grant, invalid_token, token_expired
 *  - HTTP 401 / 403 responses surfaced by the JS client
 *  - Error messages containing "jwt", "unauthorized", or "forbidden"
 */
export class SupabaseAuthError extends SupabaseError {
  constructor(message: string, details?: unknown) {
    super(message, 'AUTH_ERROR', details);
    this.name = 'SupabaseAuthError';
  }
}

/**
 * Raised when PostgreSQL aborts a transaction due to a serialization failure
 * (e.g. concurrent writes in SERIALIZABLE isolation) or a deadlock.
 *
 * Mapped from:
 *  - PostgreSQL error code 40001 (serialization_failure)
 *  - PostgreSQL error code 40P01 (deadlock_detected)
 *
 * These errors are generally safe to retry with exponential back-off.
 */
export class SupabaseSerializationError extends SupabaseError {
  constructor(message: string, details?: unknown) {
    super(message, 'SERIALIZATION_ERROR', details);
    this.name = 'SupabaseSerializationError';
  }
}
