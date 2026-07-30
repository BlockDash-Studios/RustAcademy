import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AntiCheatResult } from './interfaces/anti-cheat.interface';
import { CheckSubmissionDto } from './dto/check-submission.dto';
import { randomUUID, createHash } from 'crypto';

export interface ApiKeyRecord {
  id: string;
  userId: string;
  keyHash: string;
  label: string;
  scopes: string[];
  createdAt: Date;
  expiresAt: Date | null;
  revoked: boolean;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  usageCount: number;
}

export interface ApiKeyUsageEvent {
  apiKeyId: string;
  userId: string;
  endpoint: string;
  timestamp: Date;
  ip: string;
  userAgent: string;
}

export interface WebhookDeliveryAttempt {
  id: string;
  webhookId: string;
  url: string;
  attemptNumber: number;
  status: 'pending' | 'success' | 'failed';
  statusCode?: number;
  lastError?: string;
  nextRetryAt?: Date;
  createdAt: Date;
  completedAt?: Date;
}

@Injectable()
export class AntiCheatService {
  private readonly logger = new Logger(AntiCheatService.name);
  private readonly apiKeys = new Map<string, ApiKeyRecord>();
  private readonly apiKeyUsageLog: ApiKeyUsageEvent[] = [];
  private readonly usageRateLimit = 100;
  private readonly usageWindowMs = 60_000;
  /** Webhook delivery attempts keyed by webhookId. */
  private readonly webhookAttempts = new Map<string, WebhookDeliveryAttempt[]>();
  /** Idempotency store: idempotencyKey → first-seen timestamp. */
  private readonly webhookIdempotency = new Map<string, number>();

  async analyzeSubmission(dto: CheckSubmissionDto): Promise<AntiCheatResult> {
    this.logger.log(
      `[PLACEHOLDER] Analysing submission for learnerId=${dto.learnerId}, taskId=${dto.taskId}`,
    );

    return {
      flagged: false,
      confidence: 0,
      riskLevel: 'low',
      reason: 'AI anti-cheat check not yet implemented — placeholder result returned.',
      recommendedAction: 'none',
    };
  }

  async analyzeSubmissions(dtos: CheckSubmissionDto[]): Promise<AntiCheatResult[]> {
    this.logger.log(`[PLACEHOLDER] Batch analysing ${dtos.length} submission(s)`);
    return Promise.all(dtos.map((dto) => this.analyzeSubmission(dto)));
  }

  // ---------------------------------------------------------------------------
  // API Key Lifecycle — Issue #410
  // ---------------------------------------------------------------------------

  createApiKey(
    userId: string,
    label: string,
    scopes: string[] = ['read'],
    expiresInDays?: number,
  ): { id: string; rawKey: string } {
    const id = randomUUID();
    const rawKey = `rak_${randomUUID().replace(/-/g, '')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const record: ApiKeyRecord = {
      id,
      userId,
      keyHash,
      label,
      scopes,
      createdAt: new Date(),
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86400000) : null,
      revoked: false,
      revokedAt: null,
      lastUsedAt: null,
      usageCount: 0,
    };

    this.apiKeys.set(id, record);
    this.logger.log(`API key created for user ${userId}: ${id} (scopes: ${scopes.join(', ')})`);
    return { id, rawKey };
  }

  validateApiKey(rawKey: string, requiredScope?: string): ApiKeyRecord {
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    for (const record of this.apiKeys.values()) {
      if (record.keyHash === keyHash) {
        if (record.revoked) {
          throw new UnauthorizedException('API key has been revoked');
        }
        if (record.expiresAt && new Date() > record.expiresAt) {
          throw new UnauthorizedException('API key has expired');
        }
        if (requiredScope && !record.scopes.includes(requiredScope) && !record.scopes.includes('admin')) {
          throw new UnauthorizedException(`API key lacks required scope: ${requiredScope}`);
        }
        record.lastUsedAt = new Date();
        record.usageCount++;
        return record;
      }
    }

    throw new UnauthorizedException('Invalid API key');
  }

  revokeApiKey(keyId: string): ApiKeyRecord | null {
    const record = this.apiKeys.get(keyId);
    if (record) {
      record.revoked = true;
      record.revokedAt = new Date();
      this.logger.warn(`API key ${keyId} revoked for user ${record.userId}`);
      return record;
    }
    return null;
  }

  revokeAllUserApiKeys(userId: string): number {
    let count = 0;
    for (const record of this.apiKeys.values()) {
      if (record.userId === userId && !record.revoked) {
        record.revoked = true;
        record.revokedAt = new Date();
        count++;
      }
    }
    this.logger.warn(`Revoked ${count} API keys for user ${userId}`);
    return count;
  }

  rotateApiKey(keyId: string): { id: string; rawKey: string } | null {
    const old = this.apiKeys.get(keyId);
    if (!old) return null;
    old.revoked = true;
    old.revokedAt = new Date();
    const newKey = this.createApiKey(old.userId, old.label, old.scopes);
    this.logger.log(`Rotated API key ${keyId} → ${newKey.id} for user ${old.userId}`);
    return newKey;
  }

  getUserApiKeys(userId: string): ApiKeyRecord[] {
    return Array.from(this.apiKeys.values()).filter((r) => r.userId === userId);
  }

  listActiveApiKeys(): ApiKeyRecord[] {
    return Array.from(this.apiKeys.values()).filter((r) => !r.revoked);
  }

  // ---------------------------------------------------------------------------
  // API Key Usage Tracking & Anomaly Detection
  // ---------------------------------------------------------------------------

  trackApiKeyUsage(apiKeyId: string, userId: string, endpoint: string, ip: string, userAgent: string): void {
    this.apiKeyUsageLog.push({ apiKeyId, userId, endpoint, timestamp: new Date(), ip, userAgent });
  }

  getApiKeyUsage(apiKeyId: string, since?: Date): ApiKeyUsageEvent[] {
    const events = this.apiKeyUsageLog.filter((e) => e.apiKeyId === apiKeyId);
    if (since) return events.filter((e) => e.timestamp >= since);
    return events;
  }

  async detectAnomalies(apiKeyId: string): Promise<{ anomalous: boolean; reasons: string[] }> {
    const reasons: string[] = [];
    const now = Date.now();
    const recent = this.apiKeyUsageLog.filter(
      (e) => e.apiKeyId === apiKeyId && now - e.timestamp.getTime() < this.usageWindowMs,
    );

    if (recent.length > this.usageRateLimit) {
      reasons.push(`Rate limit exceeded: ${recent.length} requests in last minute`);
    }

    const uniqueIps = new Set(recent.map((e) => e.ip));
    if (uniqueIps.size > 5) {
      reasons.push(`Abnormal IP diversity: ${uniqueIps.size} unique IPs in last minute`);
    }

    const uniqueAgents = new Set(recent.map((e) => e.userAgent));
    if (uniqueAgents.size > 3) {
      reasons.push(`Abnormal user-agent diversity: ${uniqueAgents.size} unique agents`);
    }

    return { anomalous: reasons.length > 0, reasons };
  }

  async rotateKeysOnPrivilegeChange(userId: string): Promise<number> {
    const count = this.revokeAllUserApiKeys(userId);
    this.logger.warn(`Rotated ${count} API keys for user ${userId} due to privilege change`);
    return count;
  }

  // ---------------------------------------------------------------------------
  // Webhook Replay Detection — Issue #411
  // ---------------------------------------------------------------------------

  /**
   * Returns true if this idempotency key was already seen within the TTL window,
   * meaning the payload is a replayed/duplicate webhook callback.
   */
  isWebhookReplayed(idempotencyKey: string, ttlMs = 3_600_000): boolean {
    const now = Date.now();
    const firstSeen = this.webhookIdempotency.get(idempotencyKey);
    if (firstSeen && now - firstSeen < ttlMs) {
      this.logger.warn(`Replayed webhook detected: ${idempotencyKey}`);
      return true;
    }
    this.webhookIdempotency.set(idempotencyKey, now);
    return false;
  }

  // ---------------------------------------------------------------------------
  // Webhook Delivery with Retry & Jitter — Issue #412
  // ---------------------------------------------------------------------------

  recordWebhookAttempt(
    webhookId: string,
    url: string,
    attemptNumber: number,
    status: 'pending' | 'success' | 'failed',
    statusCode?: number,
    lastError?: string,
  ): WebhookDeliveryAttempt {
    const attempt: WebhookDeliveryAttempt = {
      id: randomUUID(),
      webhookId,
      url,
      attemptNumber,
      status,
      statusCode,
      lastError,
      createdAt: new Date(),
      completedAt: status !== 'pending' ? new Date() : undefined,
    };

    const attempts = this.webhookAttempts.get(webhookId) || [];
    attempts.push(attempt);
    this.webhookAttempts.set(webhookId, attempts);
    return attempt;
  }

  calculateRetryDelay(attemptNumber: number, baseMs: number, maxMs: number): number {
    const exponential = Math.min(baseMs * Math.pow(2, attemptNumber - 1), maxMs);
    const jitter = exponential * (0.5 + Math.random() * 0.5);
    return Math.floor(jitter);
  }

  getWebhookAttempts(webhookId: string): WebhookDeliveryAttempt[] {
    return this.webhookAttempts.get(webhookId) || [];
  }

  getPendingRetries(): WebhookDeliveryAttempt[] {
    const pending: WebhookDeliveryAttempt[] = [];
    for (const attempts of this.webhookAttempts.values()) {
      for (const a of attempts) {
        if (a.status === 'pending' && a.nextRetryAt && a.nextRetryAt <= new Date()) {
          pending.push(a);
        }
      }
    }
    return pending;
  }
}
