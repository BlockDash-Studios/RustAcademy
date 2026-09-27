/**
 * Standard API error envelope.
 *
 * Every error response from this backend follows this shape so that clients
 * can parse, log, and display errors deterministically — regardless of whether
 * the root cause is a validation failure, auth rejection, rate-limit event,
 * or domain exception.
 *
 * @example
 * // 400 Validation error
 * { success: false, error: { code: "VALIDATION_ERROR", message: "Validation failed", fields: [{ field: "amount", errors: ["must be a positive number"] }], request_id: "abc-123" } }
 *
 * @example
 * // 429 Rate limit
 * { success: false, error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many requests. Retry after 60 seconds.", request_id: "abc-123", details: { retryAfterSeconds: 60 } } }
 */
export interface ErrorEnvelope {
  success: false;
  error: {
    /**
     * Stable machine-readable error code.
     * Use this for programmatic branching — never parse the message string.
     */
    code: string;
    /** Human-readable message safe for display. */
    message: string | string[];
    /**
     * Correlation ID for distributed tracing.
     * Echoed back from the `x-request-id` header (or auto-generated).
     */
    request_id?: string;
    /** Legacy alias — prefer `request_id`. */
    correlationId?: string;
    /** Field-level validation errors (only present when code is VALIDATION_ERROR). */
    fields?: ValidationErrorField[];
    /** Additional context — omitted in production for security. */
    details?: unknown;
  };
}

/**
 * A single field-level validation error.
 */
export interface ValidationErrorField {
  /** The object property that failed validation (dot-notation for nested). */
  field: string;
  /** One or more human-readable constraint failure messages. */
  errors: string[];
}

/**
 * Well-known error codes emitted by the API.
 * Clients should match on these enum values, not raw strings.
 */
export enum ErrorCode {
  /** class-validator / ValidationPipe failures */
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  /** ThrottlerGuard / CustomThrottlerGuard rejection */
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  /** Catch-all for unhandled server errors */
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  /** Missing or invalid authentication credentials */
  UNAUTHORIZED = 'UNAUTHORIZED',
  /** Authenticated but insufficient permissions */
  FORBIDDEN = 'FORBIDDEN',
  /** Resource not found */
  NOT_FOUND = 'NOT_FOUND',
}
