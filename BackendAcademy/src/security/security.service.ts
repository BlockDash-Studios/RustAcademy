import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

export interface SignedUrlOptions {
  assetId: string;
  scope: 'read' | 'write' | 'admin';
  userId?: string;
  ttlSeconds?: number;
}

export interface SignedUrlPayload {
  assetId: string;
  scope: string;
  userId?: string;
  expiresAt: number;
  nonce: string;
  signature: string;
}

export interface WebhookIdempotencyRecord {
  idempotencyKey: string;
  firstReceivedAt: Date;
  processed: boolean;
}

@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);
  private readonly signingSecret: string;
  private readonly defaultTtlSeconds: number;
  private readonly webhookIdempotencyStore = new Map<string, WebhookIdempotencyRecord>();

  constructor(private readonly configService: ConfigService) {
    this.signingSecret = this.configService.get<string>('ASSET_SIGNING_SECRET') ?? '';
    this.defaultTtlSeconds = this.configService.get<number>('ASSET_SIGNED_URL_TTL_SECONDS') ?? 3600;
  }

  /**
   * Computes a SHA-256 content hash of a buffer.
   */
  computeContentHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Generates a signed URL token for asset access.
   */
  generateSignedUrl(options: SignedUrlOptions): string {
    const ttlSeconds = options.ttlSeconds ?? this.defaultTtlSeconds;
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    const nonce = randomBytes(16).toString('hex');

    const payload: Omit<SignedUrlPayload, 'signature'> = {
      assetId: options.assetId,
      scope: options.scope,
      userId: options.userId,
      expiresAt,
      nonce,
    };

    const signature = this.signPayload(payload);
    const signedPayload: SignedUrlPayload = { ...payload, signature };

    return Buffer.from(JSON.stringify(signedPayload)).toString('base64url');
  }

  /**
   * Verifies a signed URL token and returns the decoded payload.
   */
  verifySignedUrl(token: string): SignedUrlPayload {
    let decoded: SignedUrlPayload;
    try {
      decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
    } catch {
      throw new UnauthorizedException('Invalid signed URL token');
    }

    if (!decoded.assetId || !decoded.scope || !decoded.expiresAt || !decoded.nonce || !decoded.signature) {
      throw new UnauthorizedException('Malformed signed URL token');
    }

    if (Math.floor(Date.now() / 1000) > decoded.expiresAt) {
      throw new UnauthorizedException('Signed URL has expired');
    }

    const { signature, ...payloadWithoutSig } = decoded;
    const expectedSignature = this.signPayload(payloadWithoutSig);

    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      throw new UnauthorizedException('Invalid signed URL signature');
    }

    return decoded;
  }

  /**
   * Checks whether a given scope is authorized for the requested operation.
   */
  isScopeAuthorized(tokenScope: string, requiredScope: string): boolean {
    const hierarchy: Record<string, number> = { read: 0, write: 1, admin: 2 };
    return (hierarchy[tokenScope] ?? 0) >= (hierarchy[requiredScope] ?? 0);
  }

  /**
   * Generates an HMAC-SHA256 signature for a webhook payload.
   */
  signWebhookPayload(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Verifies an HMAC-SHA256 webhook signature using timing-safe comparison.
   */
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const expected = this.signWebhookPayload(payload, secret);
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (sigBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(sigBuffer, expectedBuffer);
  }

  /**
   * Checks idempotency for a webhook callback. Returns true if this is a
   * duplicate/replayed payload that should be rejected.
   */
  isWebhookReplayed(idempotencyKey: string, ttlSeconds?: number): boolean {
    const ttl = ttlSeconds ?? this.configService.get<number>('WEBHOOK_IDEMPOTENCY_TTL_SECONDS') ?? 3600;
    const now = Date.now();

    const existing = this.webhookIdempotencyStore.get(idempotencyKey);
    if (existing) {
      if (now - existing.firstReceivedAt.getTime() < ttl * 1000) {
        return true;
      }
      this.webhookIdempotencyStore.delete(idempotencyKey);
    }

    this.webhookIdempotencyStore.set(idempotencyKey, {
      idempotencyKey,
      firstReceivedAt: new Date(),
      processed: true,
    });
    return false;
  }

  /**
   * Marks a webhook idempotency key as processed.
   */
  markWebhookProcessed(idempotencyKey: string): void {
    const record = this.webhookIdempotencyStore.get(idempotencyKey);
    if (record) {
      record.processed = true;
    }
  }

  /**
   * Generates a random API key with a prefix.
   */
  generateApiKey(): { rawKey: string; keyHash: string } {
    const rawKey = `rak_${randomBytes(32).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    return { rawKey, keyHash };
  }

  private signPayload(payload: Record<string, unknown>): string {
    const sortedKeys = Object.keys(payload).sort();
    const canonical = sortedKeys.map((k) => `${k}=${JSON.stringify(payload[k])}`).join('&');
    return createHmac('sha256', this.signingSecret).update(canonical).digest('hex');
  }
}
