import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";

/**
 * Per-user daily token budget for AI Mentor endpoints (BE-072).
 *
 * Tracks token usage per `(userId, endpoint)` against a daily budget,
 * throttling requests once the budget is exhausted so a single user can't
 * drive unbounded AI-provider cost. This runs in-process, following the
 * same pattern as NotificationRateLimiter (see
 * ../notifications/notification-rate-limiter.ts) — for a multi-instance
 * deployment, swap the Map for a shared store (e.g. Redis).
 */

export interface TokenUsageRecord {
  userId: string;
  endpoint: string;
  tokensUsed: number;
  /** Unix ms timestamp when this user/endpoint's daily window resets. */
  resetAt: number;
}

@Injectable()
export class AiTokenBudgetService {
  private readonly usage = new Map<string, TokenUsageRecord>();

  constructor(
    /** Maximum tokens allowed per user per endpoint per day. */
    private readonly dailyBudget: number = 50_000,
    private readonly windowMs: number = 24 * 60 * 60 * 1_000,
  ) {}

  private key(userId: string, endpoint: string): string {
    return `${userId}:${endpoint}`;
  }

  private currentRecord(userId: string, endpoint: string): TokenUsageRecord {
    const key = this.key(userId, endpoint);
    const now = Date.now();
    const existing = this.usage.get(key);

    if (!existing || existing.resetAt <= now) {
      const fresh: TokenUsageRecord = {
        userId,
        endpoint,
        tokensUsed: 0,
        resetAt: now + this.windowMs,
      };
      this.usage.set(key, fresh);
      return fresh;
    }

    return existing;
  }

  /** Returns true if the user still has budget remaining for this endpoint. */
  hasBudget(userId: string, endpoint: string): boolean {
    return this.currentRecord(userId, endpoint).tokensUsed < this.dailyBudget;
  }

  /** Records token consumption for a user/endpoint after a successful AI call. */
  recordUsage(userId: string, endpoint: string, tokens: number): void {
    const record = this.currentRecord(userId, endpoint);
    record.tokensUsed += tokens;
    this.usage.set(this.key(userId, endpoint), record);
  }

  /** Unix-ms timestamp when the user's budget resets for this endpoint. */
  getResetAt(userId: string, endpoint: string): number {
    return this.currentRecord(userId, endpoint).resetAt;
  }

  /** Exportable usage metrics — one entry per active (userId, endpoint) pair. */
  getUsageSnapshot(): TokenUsageRecord[] {
    const now = Date.now();
    return [...this.usage.values()].filter((r) => r.resetAt > now);
  }

  /** For testing: clear all state. */
  reset(): void {
    this.usage.clear();
  }
}

/**
 * Guard that rejects requests from users who have exhausted their daily AI
 * token budget with 429 + a Retry-After header / reset timestamp, per
 * BE-072's acceptance criteria. Apply per-controller/route with
 * `@UseGuards(AiTokenBudgetGuard)`; the endpoint name used as the budget key
 * defaults to the request route path.
 */
@Injectable()
export class AiTokenBudgetGuard implements CanActivate {
  constructor(private readonly budgetService: AiTokenBudgetService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.id ?? request.userId;
    const endpoint: string = request.route?.path ?? request.path ?? "unknown";

    if (!userId) {
      // No authenticated user to budget against — let auth middleware/guards
      // upstream handle rejecting unauthenticated requests.
      return true;
    }

    if (!this.budgetService.hasBudget(userId, endpoint)) {
      const resetAt = this.budgetService.getResetAt(userId, endpoint);
      const response = context.switchToHttp().getResponse();
      response?.setHeader?.(
        "Retry-After",
        Math.max(0, Math.ceil((resetAt - Date.now()) / 1000)).toString(),
      );

      throw new HttpException(
        {
          error: "AI token budget exceeded for today",
          code: "TOKEN_BUDGET_EXCEEDED",
          resetAt: new Date(resetAt).toISOString(),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
