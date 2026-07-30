import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Result of sanitising an AI prompt (Issue #371).
 *
 * - `safe`             : the input contained no flagged patterns
 * - `wrapped`          : a flag was detected and the input was wrapped in
 *                        a safety boundary before being forwarded to the model
 * - `rejected`         : the input was so overtly unsafe that it was
 *                        replaced with a hard refusal
 * - `originalLength`   : length of the unprocessed input
 * - `sanitised`        : the text to forward to the downstream model
 * - `reasons`          : human-readable description of any patterns matched
 */
export interface PromptSanitisationResult {
  safe: boolean;
  status: 'safe' | 'wrapped' | 'rejected';
  sanitised: string;
  originalLength: number;
  reasons: string[];
}

/**
 * Conservative pattern catalogue for prompt-injection / unsafe content.
 * Matching is intentionally a substring check — these phrases have appeared
 * in known prompt-injection payloads circulating in 2024-2026.
 */
const UNSAFE_PROMPT_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /ignore (?:all )?(?:previous|prior|above) instructions?/i, reason: 'instruction_override' },
  { pattern: /disregard (?:all )?(?:previous|prior|above)/i, reason: 'instruction_override' },
  { pattern: /forget (?:everything|all) (?:above|before|prior)/i, reason: 'instruction_override' },
  { pattern: /you are now (?:a|an) (?:dan|jailbreak|evil|unfiltered)/i, reason: 'role_override' },
  { pattern: /\bact as (?:a )?(?:dan|jailbreak|unfiltered hacker)\b/i, reason: 'role_override' },
  { pattern: /system\s*:\s*you are/i, reason: 'fake_system_role' },
  { pattern: /\bdeveloper mode\b/i, reason: 'jailbreak_term' },
  { pattern: /\bbypass (?:safety|content|policy|filter)/i, reason: 'policy_bypass' },
  { pattern: /\bexfiltrate\b|\bleak\b.{0,40}\b(secret|token|password|key)\b/i, reason: 'data_exfiltration' },
];

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

  // ---------------------------------------------------------------------------
  // Attachment scanning — Issue #365
  // ---------------------------------------------------------------------------

  /**
   * Scans an attachment for content policy violations.
   *
   * Checks file metadata (type, size) against configured policy rules
   * to prevent storage issues and moderation problems. In production,
   * this would integrate with a virus scanner or content moderation API.
   */
  scanContentPolicy(
    fileType?: string,
    fileSize?: number,
  ): { allowed: boolean; reason?: string } {
    // Block executable and potentially dangerous file types
    const blockedTypes = [
      'application/x-msdownload',
      'application/x-msdos-program',
      'application/x-executable',
      'application/x-sh',
      'application/x-bat',
      'application/x-cmd',
      'application/x-msi',
      'application/javascript',
      'application/x-php',
      'application/x-python',
      'application/x-perl',
      'application/x-ruby',
    ];

    if (fileType && blockedTypes.includes(fileType.toLowerCase())) {
      return {
        allowed: false,
        reason: `File type "${fileType}" is blocked by content policy`,
      };
    }

    // Block zero-byte files if size is explicitly 0
    if (fileSize === 0) {
      return {
        allowed: false,
        reason: 'Empty files (0 bytes) are not allowed',
      };
    }

    return { allowed: true };
  }

  /**
   * Validates an attachment against size and type constraints.
   *
   * Returns detailed validation result for use by callers that need
   * to surface specific error details to the user.
   */
  validateAttachment(
    fileSize: number,
    fileType: string,
    maxSizeBytes: number,
    allowedTypes: string[],
  ): { valid: boolean; errorCode?: string; message?: string } {
    if (fileSize > maxSizeBytes) {
      return {
        valid: false,
        errorCode: 'ATTACHMENT_TOO_LARGE',
        message: `File size ${fileSize} exceeds maximum of ${maxSizeBytes} bytes`,
      };
    }

    if (fileType && !allowedTypes.includes(fileType.toLowerCase())) {
      return {
        valid: false,
        errorCode: 'ATTACHMENT_TYPE_NOT_ALLOWED',
        message: `File type "${fileType}" is not in the allowed types list`,
      };
    }

    return { valid: true };
  /**
   * Sanitises an AI-bound prompt (Issue #371). Returns a structured result
   * describing whether the prompt was safe, had to be wrapped, or had to be
   * rejected outright.
   *
   * The wrapping strategy keeps the model functioning for legitimate
   * educational questions that happen to mention a flagged phrase, while
   * still pinning the system role ahead of the user content so the model
   * cannot be steered into a different persona. Hard rejection is reserved
   * for the highest-risk patterns (e.g. explicit "developer mode" jailbreaks).
   */
  sanitisePrompt(input: string): PromptSanitisationResult {
    const text = (input ?? '').toString();
    const originalLength = text.length;
    if (originalLength === 0) {
      return { safe: true, status: 'safe', sanitised: '', originalLength, reasons: [] };
    }

    const matched: string[] = [];
    for (const { pattern, reason } of UNSAFE_PROMPT_PATTERNS) {
      if (pattern.test(text)) {
        matched.push(reason);
      }
    }

    if (matched.length === 0) {
      return { safe: true, status: 'safe', sanitised: text, originalLength, reasons: [] };
    }

    // Hard-reject the most dangerous jailbreak patterns outright.
    const hardReject = matched.some((reason) =>
      ['jailbreak_term', 'role_override', 'policy_bypass'].includes(reason),
    );

    if (hardReject) {
      return {
        safe: false,
        status: 'rejected',
        sanitised:
          "I'm sorry, but I can't help with that request. Please rephrase your question.",
        originalLength,
        reasons: matched,
      };
    }

    // For softer matches (instruction override, fake system role, etc.) wrap
    // the user content with a hard system-pinned boundary.
    const wrapped = [
      '<<SYSTEM_BOUNDARY>>',
      'You are a Rust programming tutor. Do not deviate from this role.',
      '<<END_SYSTEM_BOUNDARY>>',
      '<<USER_CONTENT>>',
      text,
      '<<END_USER_CONTENT>>',
    ].join('\n');

    return {
      safe: false,
      status: 'wrapped',
      sanitised: wrapped,
      originalLength,
      reasons: matched,
    };
  }

  private signPayload(payload: Record<string, unknown>): string {
    const sortedKeys = Object.keys(payload).sort();
    const canonical = sortedKeys.map((k) => `${k}=${JSON.stringify(payload[k])}`).join('&');
    return createHmac('sha256', this.signingSecret).update(canonical).digest('hex');
  }
}
