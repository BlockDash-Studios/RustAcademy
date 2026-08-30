import { Injectable, Logger, Optional, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { DatabaseService } from '../database/database.service';

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
 * Detection layer reported when a pattern is matched (Issue #654 / BA-086).
 *
 * - `direct`        : matched on the normalised text itself (URL/HTML
 *                     decoding, full-width and homoglyph folding all
 *                     happen during normalisation, so those variants
 *                     surface here)
 * - `deobfuscated`  : matched only after stripping separators/whitespace
 *                     (e.g. "i g n o r e", "i.g.n.o.r.e", "ignore_previous")
 * - `decoded`       : matched only after base64-decoding an encoded variant
 * - `multilingual`  : matched via non-English phrasing
 */
export type PromptInjectionLayer = 'direct' | 'deobfuscated' | 'decoded' | 'multilingual';

export interface PromptInjectionDetection {
  /** Empty when the input is clean. */
  reasons: string[];
  /** Layer(s) on which each reason was detected (same index as reasons). */
  layers: PromptInjectionLayer[];
  /** The normalised text that detection ran against. */
  normalized: string;
}

/**
 * Conservative pattern catalogue for prompt-injection / unsafe content.
 * Patterns are whitespace-tolerant (Issue #654) so spacing, newlines, and
 * zero-width characters cannot bypass them. These phrases have appeared in
 * known prompt-injection payloads circulating in 2024-2026.
 */
const UNSAFE_PROMPT_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?\b/i, reason: 'instruction_override' },
  { pattern: /\bdisregard\s+(?:all\s+)?(?:previous|prior|above)\b/i, reason: 'instruction_override' },
  { pattern: /\bforget\s+(?:everything|all)\s+(?:above|before|prior)\b/i, reason: 'instruction_override' },
  { pattern: /\byou\s+are\s+now\s+(?:a|an)\s+(?:dan|jailbreak|evil|unfiltered)\b/i, reason: 'role_override' },
  { pattern: /\bact\s+as\s+(?:a\s+)?(?:dan|jailbreak|unfiltered\s+hacker)\b/i, reason: 'role_override' },
  { pattern: /system\s*:\s*you\s+are\b/i, reason: 'fake_system_role' },
  { pattern: /\bdeveloper\s+mode\b/i, reason: 'jailbreak_term' },
  { pattern: /\bbypass\s+(?:safety|content|policy|filter)\b/i, reason: 'policy_bypass' },
  { pattern: /\bexfiltrate\b|\bleak\b.{0,40}\b(?:secret|token|password|key)\b/i, reason: 'data_exfiltration' },
];

/**
 * Patterns matched against the *deobfuscated* form of the input — the
 * normalised text with every non-alphanumeric character removed. This
 * catches separator-based obfuscation like "i.g.n.o.r.e all previous
 * instructions" or "ignore_previous_i_n_structions" without flagging
 * legitimate prose (the layer only runs when the input actually contained
 * separators to strip).
 */
const DEOBFUSCATED_PROMPT_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /ignore(?:all)?(?:previous|prior|above)instructions?/i, reason: 'instruction_override' },
  { pattern: /disregard(?:all)?(?:previous|prior|above)/i, reason: 'instruction_override' },
  { pattern: /forget(?:everything|all)(?:above|before|prior)/i, reason: 'instruction_override' },
  { pattern: /youare(?:now)?a(?:dan|jailbreak|evil|unfiltered)/i, reason: 'role_override' },
  { pattern: /actas(?:a)?(?:dan|jailbreak|unfilteredhacker)/i, reason: 'role_override' },
  { pattern: /system:youare/i, reason: 'fake_system_role' },
  { pattern: /developermode/i, reason: 'jailbreak_term' },
  { pattern: /bypass(?:safety|content|policy|filter)/i, reason: 'policy_bypass' },
  { pattern: /exfiltrate|leak(?:secret|token|password|key)/i, reason: 'data_exfiltration' },
];

/**
 * Multilingual phrasing for the same override attempts (Issue #654). These
 * run against the normalised text only; encoded/multilingual combinations
 * are handled by the decoded layer.
 */
const MULTILINGUAL_PROMPT_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bignore\s+(?:toutes\s+)?(?:les\s+)?instructions\s+pr[eé]c[eé]dentes\b/i, reason: 'instruction_override_multilingual' },
  { pattern: /\bignora\s+(?:todas\s+)?(?:las\s+)?instrucciones\s+anteriores\b/i, reason: 'instruction_override_multilingual' },
  { pattern: /\bignoriere\s+(?:alle\s+)?(?:fr[uü]heren\s+)?anweisungen\b/i, reason: 'instruction_override_multilingual' },
  { pattern: /\bvergiss\s+(?:alle\s+)?(?:vorherigen\s+)?anweisungen\b/i, reason: 'instruction_override_multilingual' },
];

/**
 * Homoglyph map for characters that are commonly swapped for ASCII
 * lookalikes in obfuscated prompts (Cyrillic/Greek letters that visually
 * match Latin ones). NFKC normalisation already handles full-width forms;
 * this map handles cross-script lookalikes.
 */
const HOMOGLYPH_MAP: Record<string, string> = {
  а: 'a', // Cyrillic a
  е: 'e', // Cyrillic e
  о: 'o', // Cyrillic o
  р: 'p', // Cyrillic er
  с: 'c', // Cyrillic es
  х: 'x', // Cyrillic ha
  у: 'y', // Cyrillic u
  і: 'i', // Cyrillic i
  ј: 'j', // Cyrillic je
  ѕ: 's', // Cyrillic dze
  Α: 'a', // Greek alpha
  Ε: 'e', // Greek epsilon
  Ο: 'o', // Greek omicron
  Ι: 'i', // Greek iota
  Κ: 'k', // Greek kappa
  Μ: 'm', // Greek mu
  Ν: 'n', // Greek nu
  Ρ: 'p', // Greek rho
  Τ: 't', // Greek tau
  Υ: 'y', // Greek upsilon
  Χ: 'x', // Greek chi
};

/** Characters that carry no semantic value in prompts and are routinely
 * inserted to evade substring matching (zero-width, soft hyphen, etc.). */
const ZERO_WIDTH_CHARS = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;

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

@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);
  private readonly signingSecret: string;
  private readonly defaultTtlSeconds: number;
  /** Degraded in-memory fallback used when no DatabaseService is injected. */
  private readonly webhookIdempotencyStore = new Map<
    string,
    { idempotencyKey: string; firstReceivedAt: Date; processed: boolean }
  >();

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly databaseService?: DatabaseService,
  ) {
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
   *
   * #662: webhook signatures MUST be verified against the raw request bytes
   * before the body is parsed or normalized, otherwise any transport-level
   * transformation (whitespace, key reordering, charset conversion) silently
   * invalidates — or worse, bypasses — the signature check. This method
   * operates on a `Buffer` so callers can pass `req.rawBody` untouched.
   */
  verifyWebhookSignatureRaw(body: Buffer, signature: string, secret: string): boolean {
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (sigBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(sigBuffer, expectedBuffer);
  }

  /**
   * Verifies an HMAC-SHA256 webhook signature over a string payload using
   * timing-safe comparison. Prefer {@link verifyWebhookSignatureRaw} when the
   * raw request bytes are available.
   */
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    return this.verifyWebhookSignatureRaw(Buffer.from(payload, 'utf8'), signature, secret);
  }

  /**
   * Checks idempotency for a webhook callback. Returns true if this is a
   * duplicate/replayed payload that should be rejected.
   *
   * Issue #663 (BA-095): the claim is durable and fingerprint-bound instead
   * of a process-local replay map. When no DatabaseService is injected
   * (e.g. isolated unit tests), the previous in-memory behaviour is kept as
   * a degraded fallback.
   */
  async isWebhookReplayed(
    idempotencyKey: string,
    payload?: string,
    ttlSeconds?: number,
  ): Promise<boolean> {
    const ttlMs =
      (ttlSeconds ?? this.configService.get<number>('WEBHOOK_IDEMPOTENCY_TTL_SECONDS') ?? 3600) *
      1000;
    const fingerprint = payload ? this.computeContentHash(Buffer.from(payload)) : '';

    if (this.databaseService) {
      const claim = await this.databaseService.claimWebhookIdempotency(
        idempotencyKey,
        fingerprint,
        ttlMs,
      );
      return !claim.claimed;
    }

    const now = Date.now();
    const existing = this.webhookIdempotencyStore.get(idempotencyKey);
    if (existing) {
      if (now - existing.firstReceivedAt.getTime() < ttlMs) {
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
   * Marks a webhook idempotency key as processed. With a durable store the
   * status is flipped to `completed`; otherwise the in-memory fallback
   * record is updated.
   */
  async markWebhookProcessed(idempotencyKey: string): Promise<void> {
    if (this.databaseService) {
      await this.databaseService.completeWebhookIdempotency(idempotencyKey);
      return;
    }
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
  }

  /**
   * Layered prompt-injection detection (Issue #654 / BA-086).
   *
   * The input is first normalised (Unicode NFKC, case folding, zero-width
   * removal, whitespace collapsing, URL/HTML decoding, homoglyph
   * transliteration) and then scanned in layers:
   *
   * 1. `direct`       — the pattern catalogue against the normalised text
   * 2. `deobfuscated` — separator-stripped text (only when separators were
   *                     actually present, to keep false positives low)
   * 3. `decoded`      — base64-decoded candidates re-scanned with the
   *                     direct catalogue
   * 4. `multilingual` — non-English phrasing of the same override attempts
   */
  detectPromptInjection(input: string): PromptInjectionDetection {
    const text = (input ?? '').toString();
    const normalized = this.normalizePrompt(text);
    const reasons: string[] = [];
    const layers: PromptInjectionLayer[] = [];

    // Layer 1 — direct match on the normalised text.
    for (const { pattern, reason } of UNSAFE_PROMPT_PATTERNS) {
      if (pattern.test(normalized) && !reasons.includes(reason)) {
        reasons.push(reason);
        layers.push('direct');
      }
    }

    // Layer 2 — deobfuscated match. Only runs when the input actually
    // contained separators, so clean text is never re-scanned needlessly.
    const deobfuscated = this.deobfuscate(normalized);
    if (deobfuscated !== normalized) {
      for (const { pattern, reason } of DEOBFUSCATED_PROMPT_PATTERNS) {
        if (pattern.test(deobfuscated) && !reasons.includes(reason)) {
          reasons.push(reason);
          layers.push('deobfuscated');
        }
      }
    }

    // Layer 3 — decoded variants (base64). The decoded payload is
    // normalised again and scanned with the direct catalogue.
    for (const decoded of this.decodeCandidates(text, normalized)) {
      for (const { pattern, reason } of UNSAFE_PROMPT_PATTERNS) {
        if (pattern.test(decoded) && !reasons.includes(reason)) {
          reasons.push(reason);
          layers.push('decoded');
        }
      }
    }

    // Layer 4 — multilingual phrasing.
    for (const { pattern, reason } of MULTILINGUAL_PROMPT_PATTERNS) {
      if (pattern.test(normalized) && !reasons.includes(reason)) {
        reasons.push(reason);
        layers.push('multilingual');
      }
    }

    return { reasons, layers, normalized };
  }

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

    const detection = this.detectPromptInjection(text);
    const matched = detection.reasons;

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

  // ---------------------------------------------------------------------------
  // Prompt normalisation — Issue #654 (BA-086)
  // ---------------------------------------------------------------------------

  /**
   * Reduces the many textual variations that can hide a phrase to a single
   * canonical form: Unicode NFKC (collapses full-width/ligature forms),
   * case folding, zero-width removal, whitespace collapsing, URL- and
   * HTML-decoding (repeatedly, for double-encoded payloads), and homoglyph
   * transliteration.
   */
  private normalizePrompt(input: string): string {
    let text = input.normalize('NFKC');
    text = text.toLowerCase();
    text = text.replace(ZERO_WIDTH_CHARS, '');
    text = text.replace(/\u00A0/g, ' ');
    text = this.decodeUrlEncoding(text);
    text = this.decodeHtmlEntities(text);
    // Transliterate cross-script lookalikes.
    text = text.replace(/[а-яА-Яa-zA-Zα-ωΑ-Ω]/g, (ch) => HOMOGLYPH_MAP[ch] ?? ch);
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  }

  /**
   * Percent-decodes a string up to 3 times so single- and double-encoded
   * payloads are both reduced to plain text.
   */
  private decodeUrlEncoding(input: string): string {
    let text = input;
    for (let i = 0; i < 3; i++) {
      if (!text.includes('%')) break;
      const decoded = this.safeDecodeUriComponent(text);
      if (decoded === text) break;
      text = decoded;
    }
    return text;
  }

  private safeDecodeUriComponent(input: string): string {
    try {
      return decodeURIComponent(input);
    } catch {
      return input;
    }
  }

  /**
   * Decodes the common HTML entities (&amp;, &lt;, &gt;, &quot;, &#39;,
   * &nbsp;, and numeric forms) up to 3 times.
   */
  private decodeHtmlEntities(input: string): string {
    let text = input;
    const entityMap: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&apos;': "'",
      '&nbsp;': ' ',
    };
    for (let i = 0; i < 3; i++) {
      let changed = false;
      for (const [entity, replacement] of Object.entries(entityMap)) {
        if (text.includes(entity)) {
          text = text.split(entity).join(replacement);
          changed = true;
        }
      }
      // Numeric entities: &#123; and &#x1F;.
      text = text.replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => {
        changed = true;
        try {
          return String.fromCodePoint(parseInt(hex, 16));
        } catch {
          return _m;
        }
      });
      text = text.replace(/&#(\d+);/g, (_m, dec: string) => {
        changed = true;
        try {
          return String.fromCodePoint(parseInt(dec, 10));
        } catch {
          return _m;
        }
      });
      if (!changed) break;
    }
    return text;
  }

  /**
   * Removes every non-alphanumeric character from the normalised text so
   * separator-obfuscated phrases collapse back into plain words.
   */
  private deobfuscate(normalized: string): string {
    return normalized.replace(/[^a-z0-9]/g, '');
  }

  /**
   * Produces candidate decoded forms of the input to scan. Only base64-ish
   * inputs are considered (alphabet, padding, minimum length) to avoid
   * decoding ordinary prose and doubling false-positive surface.
   */
  private decodeCandidates(raw: string, normalized: string): string[] {
    const candidates: string[] = [];
    for (const candidate of [raw.trim(), normalized]) {
      if (!this.looksLikeBase64(candidate)) continue;
      try {
        const decoded = Buffer.from(candidate, 'base64').toString('utf-8');
        if (decoded && /[a-z]{3,}/i.test(decoded)) {
          candidates.push(this.normalizePrompt(decoded));
        }
      } catch {
        // Not valid base64 — ignore.
      }
    }
    return [...new Set(candidates)];
  }

  private looksLikeBase64(input: string): boolean {
    if (input.length < 16 || input.length % 4 !== 0) return false;
    return /^[a-z0-9+/]+=*$/i.test(input);
  }
}
