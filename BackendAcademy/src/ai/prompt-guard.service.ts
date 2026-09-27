import { Injectable } from '@nestjs/common';

/**
 * Prompt-injection & content-moderation hardening for AI Mentor endpoints
 * (BE-075).
 *
 * Every user-supplied string that ends up inside an AI prompt (mentor chat
 * messages, submitted code, hint requests) should pass through
 * `PromptGuardService.check()` first. This is deliberately independent of
 * `AiModule`/`ClaudeClient` so it can be applied at any call site that
 * builds a prompt, not only ones that go through the Claude client.
 */

export type FlagReason = 'prompt_injection' | 'abusive_content';

export interface FlaggedInteraction {
  id: string;
  userId: string;
  reason: FlagReason;
  /** The specific pattern/word that triggered the flag. */
  matched: string;
  content: string;
  flaggedAt: string;
}

export interface PromptGuardResult {
  /** True when the content is safe to forward into a prompt as-is. */
  allowed: boolean;
  reason?: FlagReason;
  matched?: string;
}

/**
 * Common prompt-injection patterns: attempts to override the system prompt,
 * exfiltrate it, or make the model ignore its instructions/role.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+|the\s+)?(previous|prior|above)\s+instructions?/i,
  /disregard\s+(all\s+|the\s+)?(previous|prior|above)\s+(instructions?|prompts?)/i,
  /you\s+are\s+now\s+(a|an)\b/i,
  /new\s+instructions?\s*:/i,
  /system\s*prompt\s*:/i,
  /reveal\s+(your|the)\s+(system\s+)?prompt/i,
  /act\s+as\s+(if\s+you\s+(are|were)|a)\b.*\b(no\s+restrictions|unfiltered|jailbroken)/i,
  /\bDAN\s+mode\b/i,
];

const ABUSIVE_PATTERNS: RegExp[] = [/\bfuck\b/i, /\bshit\b/i, /\bbitch\b/i, /\basshole\b/i];

@Injectable()
export class PromptGuardService {
  private readonly flagged: FlaggedInteraction[] = [];
  private nextId = 1;

  /**
   * Checks `content` for prompt-injection or abusive-content patterns.
   * When a pattern matches, the interaction is recorded in the audit log
   * (see `getFlaggedInteractions`) and `allowed: false` is returned —
   * callers should reject or sanitize the content rather than forwarding
   * it into a prompt.
   */
  check(userId: string, content: string): PromptGuardResult {
    for (const pattern of INJECTION_PATTERNS) {
      const match = content.match(pattern);
      if (match) {
        this.recordFlag(userId, 'prompt_injection', match[0], content);
        return { allowed: false, reason: 'prompt_injection', matched: match[0] };
      }
    }

    for (const pattern of ABUSIVE_PATTERNS) {
      const match = content.match(pattern);
      if (match) {
        this.recordFlag(userId, 'abusive_content', match[0], content);
        return { allowed: false, reason: 'abusive_content', matched: match[0] };
      }
    }

    return { allowed: true };
  }

  private recordFlag(userId: string, reason: FlagReason, matched: string, content: string): void {
    this.flagged.push({
      id: `flag_${this.nextId++}`,
      userId,
      reason,
      matched,
      content,
      flaggedAt: new Date().toISOString(),
    });
  }

  /** Audit log of every flagged interaction, most recent last. */
  getFlaggedInteractions(): FlaggedInteraction[] {
    return [...this.flagged];
  }

  /** Flagged interactions for a single user — for tutor/admin review. */
  getFlaggedInteractionsForUser(userId: string): FlaggedInteraction[] {
    return this.flagged.filter((f) => f.userId === userId);
  }
}
