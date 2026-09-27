export type ErrorContext = {
  requestId?: string;
  correlationId?: string;
  userId?: string;
  route?: string;
  codeOrigin?: string;
  componentStack?: string;
  extra?: Record<string, unknown>;
};

export type ErrorPayload = {
  timestamp: string;
  error: {
    name?: string;
    message: string;
    stack?: string;
  };
  context: ErrorContext;
  appVersion: string;
  environment: string;
  codeOrigin?: string;
  userAgent?: string;
};

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(\+?[\d\s\-()]{10,})/g;
const CARD_RE = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;
const STELLAR_SECRET_KEY_RE = /\bS[A-Z0-9]{55}\b/g;
const BEARER_TOKEN_RE = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const JWT_RE = /\beyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\b/g;
const API_KEY_RE = /\b(api[_-]?key\s*[:=]\s*)[A-Za-z0-9\-._~+/]+/gi;
const PASSWORD_RE = /\b(password\s*[:=]\s*)[^\s"',}]+/gi;
const SECRET_RE = /\b(secret\s*[:=]\s*)[^\s"',}]+/gi;

/**
 * Keys whose values must never leave the browser. Covers credentials plus
 * wallet/transaction material that marketplace bid requests can carry.
 */
const SENSITIVE_KEY_PATTERN = /^(password|secret|token|apiKey|api_key|api-key|privateKey|private_key|secretKey|secret_key|auth|authorization|signature|seed|seedPhrase|mnemonic|walletSecret|wallet_secret|sessionCookie|cookie)$/i;

export function extractCodeOrigin(stack?: string): string | undefined {
  if (!stack) return undefined;
  const lines = stack.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("at ") && !trimmed.includes("errorReporter")) {
      return trimmed;
    }
  }
  return undefined;
}

export function redactPII(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    // Redact cards before phones since phone regex may match card digits
    return value
      .replace(EMAIL_RE, "[REDACTED_EMAIL]")
      .replace(CARD_RE, "[REDACTED_CARD]")
      .replace(PHONE_RE, "[REDACTED_PHONE]")
      .replace(STELLAR_SECRET_KEY_RE, "[REDACTED_SECRET_KEY]")
      .replace(BEARER_TOKEN_RE, "Bearer [REDACTED_TOKEN]")
      .replace(JWT_RE, "[REDACTED_JWT]")
      .replace(API_KEY_RE, "$1[REDACTED_API_KEY]")
      .replace(PASSWORD_RE, "$1[REDACTED_PASSWORD]")
      .replace(SECRET_RE, "$1[REDACTED_SECRET]");
  }

  if (Array.isArray(value)) {
    return value.map(redactPII);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => {
        if (SENSITIVE_KEY_PATTERN.test(key)) {
          return [key, "[REDACTED]"];
        }
        return [key, redactPII(child)];
      })
    );
  }

  return value;
}

class ErrorReporter {
  async captureError(error: Error, context?: ErrorContext): Promise<void> {
    const enabled = process.env.NEXT_PUBLIC_ERROR_REPORTING_ENABLED === "true";
    const environment = process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || "unknown";
    const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "unknown";

    const route =
      context?.route ??
      (typeof window !== "undefined" ? window.location.pathname : undefined);

    const codeOrigin =
      context?.codeOrigin ??
      (typeof context?.extra?.source === "string" ? context.extra.source : undefined) ??
      (typeof context?.extra?.component === "string" ? context.extra.component : undefined) ??
      extractCodeOrigin(error.stack);

    const fullContext: ErrorContext = {
      ...context,
      route,
      codeOrigin,
    };

    const errorPayload: ErrorPayload = {
      timestamp: new Date().toISOString(),
      error: redactPII({
        name: error.name || "Error",
        message: error.message || String(error),
        stack: error.stack,
      }) as { name?: string; message: string; stack?: string },
      context: redactPII(fullContext) as ErrorContext,
      appVersion,
      environment,
      codeOrigin: redactPII(codeOrigin) as string | undefined,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    };

    if (!enabled || environment === "development") {
      console.warn(
        "Client error reporting is disabled. Error payload:",
        errorPayload
      );
      return;
    }

    const url = process.env.NEXT_PUBLIC_ERROR_REPORTING_URL;
    if (!url) {
      console.warn(
        "Client error reporting URL is not configured. Error payload:",
        errorPayload
      );
      return;
    }

    try {
      await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(errorPayload),
      });
    } catch (sendError) {
      console.warn("Failed to send client error report:", sendError, errorPayload);
    }
  }
}

export const errorReporter = new ErrorReporter();
export default errorReporter;
