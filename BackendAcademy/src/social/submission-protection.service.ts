import { createHash } from 'crypto';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

/**
 * NestJS 10 ships no built-in 429 exception class, so this module defines the
 * one it needs; the subclass carries the Retry-After hint.
 */
export class TooManyRequestsException extends HttpException {
  constructor(message = 'Too many requests') {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

export class SubmissionRateLimitException extends TooManyRequestsException {
  constructor(readonly retryAfterSeconds: number, message = 'Submission rate limit exceeded') {
    super(message);
  }
}

@Injectable()
export class SubmissionProtectionService {
  private readonly rateWindows = new Map<string, { count: number; expiresAt: number }>();
  private readonly duplicateKeys = new Map<string, number>();
  private readonly limit = Number(process.env.SUBMISSION_RATE_LIMIT ?? 5);
  private readonly windowSeconds = Number(process.env.SUBMISSION_RATE_WINDOW_SECONDS ?? 60);
  private readonly duplicateWindowSeconds = Number(process.env.SUBMISSION_DUPLICATE_WINDOW_SECONDS ?? 30);
  private readonly redisUrl = process.env.REDIS_REST_URL;
  private readonly redisToken = process.env.REDIS_REST_TOKEN;

  async protect<T>(input: {
    userId: string;
    clientIp: string;
    challengeId: string;
    submissionId: string;
    action: () => T;
  }): Promise<T> {
    await this.incrementRate(`user:${input.userId}`);
    await this.incrementRate(`ip:${input.clientIp}`);

    const duplicateKey = createHash('sha256')
      .update(`${input.userId}:${input.challengeId}:${input.submissionId}`)
      .digest('hex');
    const acquired = await this.reserveDuplicate(duplicateKey);
    if (!acquired) {
      throw new SubmissionRateLimitException(this.duplicateWindowSeconds, 'Duplicate submission detected');
    }

    try {
      return input.action();
    } catch (error) {
      await this.releaseDuplicate(duplicateKey);
      throw error;
    }
  }

  private async incrementRate(identity: string): Promise<void> {
    const key = `backend-academy:submission:${identity}`;
    if (this.redisUrl) {
      const result = await this.redisCommand([
        'EVAL',
        "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return {n,redis.call('TTL',KEYS[1])}",
        '1',
        key,
        String(this.windowSeconds),
      ]);
      const [count, ttl] = result as number[];
      if (Number(count) > this.limit) throw new SubmissionRateLimitException(Math.max(1, Number(ttl)));
      return;
    }

    const now = Date.now();
    const current = this.rateWindows.get(key);
    if (!current || current.expiresAt <= now) {
      this.rateWindows.set(key, { count: 1, expiresAt: now + this.windowSeconds * 1000 });
      return;
    }
    current.count += 1;
    if (current.count > this.limit) {
      throw new SubmissionRateLimitException(Math.max(1, Math.ceil((current.expiresAt - now) / 1000)));
    }
  }

  private async reserveDuplicate(hash: string): Promise<boolean> {
    const key = `backend-academy:submission:duplicate:${hash}`;
    if (this.redisUrl) {
      const result = await this.redisCommand([
        'SET',
        key,
        '1',
        'NX',
        'EX',
        String(this.duplicateWindowSeconds),
      ]);
      return result === 'OK';
    }

    const now = Date.now();
    const expiresAt = this.duplicateKeys.get(key) ?? 0;
    if (expiresAt > now) return false;
    this.duplicateKeys.set(key, now + this.duplicateWindowSeconds * 1000);
    return true;
  }

  private async releaseDuplicate(hash: string): Promise<void> {
    const key = `backend-academy:submission:duplicate:${hash}`;
    if (this.redisUrl) {
      await this.redisCommand(['DEL', key]);
      return;
    }
    this.duplicateKeys.delete(key);
  }

  private async redisCommand(command: string[]): Promise<unknown> {
    if (!this.redisToken) throw new Error('REDIS_REST_TOKEN is required when REDIS_REST_URL is set');
    const response = await fetch(this.redisUrl!, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.redisToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });
    if (!response.ok) throw new Error(`Redis command failed with status ${response.status}`);
    const payload = await response.json() as { result?: unknown; error?: string };
    if (payload.error) throw new Error(`Redis command failed: ${payload.error}`);
    return payload.result;
  }
}