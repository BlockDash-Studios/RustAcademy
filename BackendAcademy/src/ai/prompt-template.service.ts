import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync, existsSync } from 'fs';
import { isAbsolute, relative, resolve, sep } from 'path';

/**
 * Approval metadata recorded for a prompt template version.
 *
 * #653 (BA-085): prompt changes can affect learner safety and grading
 * behaviour, so every version carries a review trail: who approved it,
 * when, and any review notes.
 */
export interface PromptTemplateApproval {
  status: 'approved' | 'pending' | 'rejected';
  approvedBy?: string;
  approvedAt?: Date;
  reviewNotes?: string;
}

/**
 * Rollback metadata recorded when an active template is rolled back.
 *
 * #653 (BA-085): the previous active version keeps a record of what it
 * was rolled back from, by whom, when, and why.
 */
export interface PromptTemplateRollback {
  /** Version that superseded / replaced this one via a rollback. */
  rolledBackFrom?: string;
  rolledBackAt?: Date;
  rolledBackBy?: string;
  reason?: string;
}

/**
 * Represents a single prompt template with its version metadata.
 *
 * #374: Prompt templates are versioned so that changes can be
 * audited, tested, and rolled out in a controlled manner.
 * #653 (BA-085): each version additionally records its author,
 * approval, effective time, and rollback metadata so prompt changes
 * have a full governance trail.
 */
export interface PromptTemplate {
  /** Semantic version of this template */
  version: string;
  /** Human-readable description of the template's purpose */
  description: string;
  /** The system prompt text */
  systemPrompt: string;
  /** Optional role for the assistant */
  assistantRole?: string;
  /** Author of this version (who created/modified it) — #653 */
  author?: string;
  /** Approval trail for this version — #653 */
  approval?: PromptTemplateApproval;
  /** Time from which this version is eligible to be active — #653 */
  effectiveAt?: Date;
  /** Rollback trail — #653 */
  rollback?: PromptTemplateRollback;
  /** Optional metadata about the template */
  metadata?: Record<string, unknown>;
}

/**
 * A collection of prompt templates keyed by template name.
 */
interface PromptTemplateConfig {
  /** Schema version for the config file itself */
  schemaVersion: string;
  templates: Record<string, PromptTemplate[]>;
}

/**
 * Default prompt templates used when no external configuration file
 * is provided. These serve as the baseline v1.0.0 templates.
 *
 * #374: Templates are extracted from inline code into this versioned
 * configuration so they can be audited and evolved independently.
 */
const DEFAULT_TEMPLATES: PromptTemplateConfig = {
  schemaVersion: '1.0.0',
  templates: {
    chat_tutor: [
      {
        version: '1.0.0',
        description: 'Default Rust programming tutor persona for chat interactions.',
        systemPrompt:
          'You are a helpful Rust programming tutor. Provide clear, concise explanations and encourage best practices. When reviewing code, point out potential improvements and explain the reasoning behind them.',
        assistantRole: 'Rust Programming Tutor',
        author: 'platform',
        approval: { status: 'approved', approvedBy: 'platform', approvedAt: new Date('2026-01-01T00:00:00.000Z'), reviewNotes: 'Baseline v1 templates.' },
        effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
    code_review: [
      {
        version: '1.0.0',
        description: 'Code review assistant persona.',
        systemPrompt:
          'You are a Rust code reviewer. Analyse the submitted code for correctness, safety, performance, and idiomatic Rust style. Suggest concrete improvements with examples.',
        assistantRole: 'Rust Code Reviewer',
        author: 'platform',
        approval: { status: 'approved', approvedBy: 'platform', approvedAt: new Date('2026-01-01T00:00:00.000Z'), reviewNotes: 'Baseline v1 templates.' },
        effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
    hint_generator: [
      {
        version: '1.0.0',
        description: 'Progressive hint generator for coding challenges.',
        systemPrompt:
          'You are a hint generator for Rust coding challenges. Provide hints at three difficulty levels: 1) gentle nudge, 2) more specific guidance, 3) near-solution. Never give the full answer directly.',
        assistantRole: 'Hint Generator',
        author: 'platform',
        approval: { status: 'approved', approvedBy: 'platform', approvedAt: new Date('2026-01-01T00:00:00.000Z'), reviewNotes: 'Baseline v1 templates.' },
        effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
    fallback: [
      {
        version: '1.0.0',
        description: 'Fallback responses when AI provider is unavailable.',
        systemPrompt:
          'You are a Rust Academy assistant operating in offline/fallback mode. Provide helpful but generic guidance since you cannot access the AI model at this time.',
        assistantRole: 'Offline Assistant',
        author: 'platform',
        approval: { status: 'approved', approvedBy: 'platform', approvedAt: new Date('2026-01-01T00:00:00.000Z'), reviewNotes: 'Baseline v1 templates.' },
        effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
  },
};

/**
 * Semantic version pattern used to validate `schemaVersion` and each
 * template `version` field.
 *
 * #651 (BA-083): externally supplied templates must declare a valid
 * version before they can be activated.
 */
const SEMVER_REGEX = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;

/**
 * Template name pattern. Names must start with a letter and contain only
 * letters, digits, underscores, or hyphens — no spaces or other symbols.
 *
 * #651 (BA-083): malformed template names are rejected during validation.
 */
const TEMPLATE_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

const APPROVAL_STATUSES = new Set(['approved', 'pending', 'rejected']);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDateLike(value: unknown): boolean {
  return (
    value instanceof Date ||
    (typeof value === 'string' && value.length > 0 && !isNaN(Date.parse(value)))
  );
}

@Injectable()
export class PromptTemplateService implements OnModuleInit {
  private readonly logger = new Logger(PromptTemplateService.name);
  private templates: PromptTemplateConfig = DEFAULT_TEMPLATES;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.reloadTemplates();
  }

  /**
   * Reloads prompt templates from the configured file path. Failed loads keep
   * the currently active configuration, which is the built-in default set at startup.
   *
   * #374: Templates are loaded from a version-controlled config file
   * so operators can update prompts without redeploying code.
   */
  reloadTemplates(): boolean {
    const templatePath = this.configService.get<string>('AI_PROMPT_TEMPLATE_PATH');
    if (!templatePath) {
      this.logger.log('No prompt template path configured; using built-in defaults');
      return false;
    }

    const applicationRoot = resolve(process.cwd());
    const resolvedPath = resolve(applicationRoot, templatePath);
    const pathFromApplicationRoot = relative(applicationRoot, resolvedPath);
    if (
      pathFromApplicationRoot === '..' ||
      pathFromApplicationRoot.startsWith(`..${sep}`) ||
      isAbsolute(pathFromApplicationRoot)
    ) {
      this.logger.warn('Prompt template path must be within the application directory');
      return false;
    }
    if (!existsSync(resolvedPath)) {
      this.logger.warn(
        `Prompt template file not found at ${resolvedPath}; keeping active templates`,
      );
      return false;
    }

    try {
      const raw = readFileSync(resolvedPath, 'utf-8');
      const parsed = JSON.parse(raw) as PromptTemplateConfig;

      if (!this.isValidConfig(parsed)) {
        throw new Error('Invalid prompt template config');
      }

      // Construct the complete candidate before replacing the active configuration.
      const nextTemplates: PromptTemplateConfig = {
        schemaVersion: parsed.schemaVersion,
        templates: {
          ...DEFAULT_TEMPLATES.templates,
          ...parsed.templates,
        },
      };
      this.templates = nextTemplates;

      this.logger.log(
        `Loaded prompt templates from ${resolvedPath} (schema v${parsed.schemaVersion})`,
      );
      return true;
    } catch (err) {
      this.logger.error(
        `Failed to load prompt templates from ${resolvedPath}: ${(err as Error).message}`,
      );
      this.logger.warn('Keeping the previously active prompt templates');
      return false;
    }
  }

  /**
   * Validates the full external prompt-template configuration before it is
   * allowed to replace the active configuration.
   *
   * #651 (BA-083): validation is performed deeply, covering the schema
   * version, every template name, every version's format, required text
   * fields, and the contents of each version array (including nested
   * approval/rollback metadata).
   */
  private isValidConfig(config: PromptTemplateConfig): boolean {
    if (
      !config ||
      typeof config !== 'object' ||
      Array.isArray(config) ||
      typeof config.schemaVersion !== 'string' ||
      !SEMVER_REGEX.test(config.schemaVersion) ||
      !config.templates ||
      typeof config.templates !== 'object' ||
      Array.isArray(config.templates)
    ) {
      return false;
    }

    for (const [name, versions] of Object.entries(config.templates)) {
      if (!TEMPLATE_NAME_REGEX.test(name)) {
        this.logger.warn(`Rejecting prompt template with invalid name: "${name}"`);
        return false;
      }

      if (!Array.isArray(versions) || versions.length === 0) {
        this.logger.warn(`Rejecting template "${name}": versions must be a non-empty array`);
        return false;
      }

      const seenVersions = new Set<string>();
      for (const version of versions) {
        if (!this.isValidTemplate(version)) {
          this.logger.warn(`Rejecting malformed version entry for template "${name}"`);
          return false;
        }

        if (seenVersions.has(version.version)) {
          this.logger.warn(
            `Rejecting template "${name}": duplicate version "${version.version}"`,
          );
          return false;
        }
        seenVersions.add(version.version);
      }
    }

    return true;
  }

  /**
   * Validates a single prompt-template version entry, including the required
   * text fields and any nested approval/rollback metadata.
   *
   * #651 (BA-083): `version` must be semver, `description` and `systemPrompt`
   * must be non-empty, and optional metadata must be a plain object.
   */
  private isValidTemplate(template: unknown): template is PromptTemplate {
    if (!template || typeof template !== 'object' || Array.isArray(template)) {
      return false;
    }
    const t = template as Record<string, unknown>;

    if (typeof t.version !== 'string' || !SEMVER_REGEX.test(t.version)) {
      return false;
    }
    if (!isNonEmptyString(t.description)) {
      return false;
    }
    if (!isNonEmptyString(t.systemPrompt)) {
      return false;
    }
    if (t.assistantRole !== undefined && !isNonEmptyString(t.assistantRole)) {
      return false;
    }
    if (t.author !== undefined && typeof t.author !== 'string') {
      return false;
    }
    if (t.effectiveAt !== undefined && !isDateLike(t.effectiveAt)) {
      return false;
    }
    if (!this.isValidApproval(t.approval)) {
      return false;
    }
    if (!this.isValidRollback(t.rollback)) {
      return false;
    }
    if (
      t.metadata !== undefined &&
      (typeof t.metadata !== 'object' || t.metadata === null || Array.isArray(t.metadata))
    ) {
      return false;
    }
    return true;
  }

  /**
   * Validates optional approval metadata on a template version.
   *
   * #651 (BA-083): when present, the status must be a recognised value and
   * any supplied fields must be of the correct type.
   */
  private isValidApproval(approval: unknown): boolean {
    if (approval === undefined) return true;
    if (!approval || typeof approval !== 'object' || Array.isArray(approval)) {
      return false;
    }
    const a = approval as Record<string, unknown>;
    if (
      typeof a.status !== 'string' ||
      !APPROVAL_STATUSES.has(a.status)
    ) {
      return false;
    }
    if (a.approvedBy !== undefined && !isNonEmptyString(a.approvedBy)) {
      return false;
    }
    if (a.reviewNotes !== undefined && typeof a.reviewNotes !== 'string') {
      return false;
    }
    if (a.approvedAt !== undefined && !isDateLike(a.approvedAt)) {
      return false;
    }
    return true;
  }

  /**
   * Validates optional rollback metadata on a template version.
   *
   * #651 (BA-083): when present, any supplied fields must be of the correct
   * type.
   */
  private isValidRollback(rollback: unknown): boolean {
    if (rollback === undefined) return true;
    if (!rollback || typeof rollback !== 'object' || Array.isArray(rollback)) {
      return false;
    }
    const r = rollback as Record<string, unknown>;
    if (r.rolledBackFrom !== undefined && !isNonEmptyString(r.rolledBackFrom)) {
      return false;
    }
    if (r.rolledBackBy !== undefined && !isNonEmptyString(r.rolledBackBy)) {
      return false;
    }
    if (r.reason !== undefined && typeof r.reason !== 'string') {
      return false;
    }
    if (r.rolledBackAt !== undefined && !isDateLike(r.rolledBackAt)) {
      return false;
    }
    return true;
  }

  /**
   * Retrieves the system prompt for a given template name and optional
   * version constraint.
   *
   * @param templateName - The name of the template (e.g., 'chat_tutor')
   * @param options - Optional version and metadata overrides
   * @returns The system prompt string
   *
   * #374: Callers specify a template name and optionally a version.
   * If the requested version doesn't exist, the latest available version
   * is returned with a warning logged.
   */
  getSystemPrompt(
    templateName: string,
    options?: { version?: string; metadata?: Record<string, unknown> },
  ): string {
    const active = this.getActiveTemplate(templateName, options?.version);
    if (!active) {
      this.logger.warn(
        `No active template for "${templateName}"; returning generic fallback`,
      );
      return DEFAULT_TEMPLATES.templates.fallback[0].systemPrompt;
    }
    this.logger.debug(
      `Using prompt template "${templateName}" v${active.version} (${active.author ?? 'unknown'} / ${active.approval?.status ?? 'pending'})`,
    );
    return active.systemPrompt;
  }

  /**
   * Returns the currently active template version for a given template name.
   *
   * #653 (BA-085): a version is active only when it is approved and its
   * effective time has been reached, and it has not been rolled back. If a
   * specific version is requested it is honoured when it satisfies those
   * constraints; otherwise the latest eligible version wins.
   */
  getActiveTemplate(
    templateName: string,
    version?: string,
  ): PromptTemplate | null {
    const versions = this.templates.templates[templateName];
    if (!versions || versions.length === 0) return null;
    const now = new Date();

    const eligible = versions.filter(
      (v) =>
        v.approval?.status === 'approved' &&
        !v.rollback &&
        (!v.effectiveAt || v.effectiveAt <= now),
    );
    if (eligible.length === 0) return null;

    if (version) {
      const match = eligible.find((v) => v.version === version);
      if (match) return match;
      this.logger.warn(
        `Version ${version} not active for template "${templateName}"; using latest eligible`,
      );
    }

    return eligible[eligible.length - 1];
  }

  /**
   * Returns the current active template version string for a template name.
   */
  getTemplateVersion(templateName: string): string | null {
    return this.getActiveTemplate(templateName)?.version ?? null;
  }

  /**
   * Records approval metadata for a specific template version.
   *
   * #653 (BA-085): approving a version writes the approver, timestamp, and
   * review notes onto the version so the approval trail is inspectable.
   */
  approveTemplate(
    templateName: string,
    version: string,
    approvedBy: string,
    reviewNotes?: string,
  ): PromptTemplate | null {
    const target = this.findTemplate(templateName, version);
    if (!target) return null;
    target.approval = {
      status: 'approved',
      approvedBy,
      approvedAt: new Date(),
      reviewNotes,
    };
    this.logger.log(
      `Prompt template "${templateName}" v${version} approved by ${approvedBy}`,
    );
    return target;
  }

  /**
   * Records rollback metadata on the currently active version and marks the
   * previous eligible version as active again.
   *
   * #653 (BA-085): the superseded version keeps a record of what it was
   * rolled back from, by whom, when, and why.
   */
  rollbackTemplate(
    templateName: string,
    rolledBackBy: string,
    reason?: string,
  ): PromptTemplate | null {
    const active = this.getActiveTemplate(templateName);
    if (!active) return null;

    active.rollback = {
      rolledBackFrom: this.getPreviousEligibleVersion(templateName, active.version) ?? undefined,
      rolledBackAt: new Date(),
      rolledBackBy,
      reason,
    };
    this.logger.warn(
      `Prompt template "${templateName}" v${active.version} rolled back by ${rolledBackBy}${reason ? `: ${reason}` : ''}`,
    );
    return active;
  }

  /**
   * Returns the audit trail for a template: every version with its author,
   * approval, effective time, and rollback metadata.
   */
  getTemplateAuditTrail(
    templateName: string,
  ): Array<{
    version: string;
    description: string;
    author?: string;
    approval?: PromptTemplateApproval;
    effectiveAt?: Date;
    rollback?: PromptTemplateRollback;
  }> {
    const versions = this.templates.templates[templateName] ?? [];
    return versions.map(({ version, description, author, approval, effectiveAt, rollback }) => ({
      version,
      description,
      author,
      approval,
      effectiveAt,
      rollback,
    }));
  }

  /**
   * Returns all available template names and their versions.
   *
   * #374: Enables auditing of which templates are available and their versions.
   */
  listTemplates(): Array<{ name: string; versions: string[] }> {
    return Object.entries(this.templates.templates).map(([name, versions]) => ({
      name,
      versions: versions.map((v) => v.version),
    }));
  }

  private findTemplate(templateName: string, version: string): PromptTemplate | null {
    const versions = this.templates.templates[templateName];
    return versions?.find((v) => v.version === version) ?? null;
  }

  private getPreviousEligibleVersion(
    templateName: string,
    currentVersion: string,
  ): string | null {
    const versions = this.templates.templates[templateName] ?? [];
    const index = versions.findIndex((v) => v.version === currentVersion);
    if (index <= 0) return null;
    const now = new Date();
    for (let i = index - 1; i >= 0; i--) {
      const v = versions[i];
      if (
        v.approval?.status === 'approved' &&
        !v.rollback &&
        (!v.effectiveAt || v.effectiveAt <= now)
      ) {
        return v.version;
      }
    }
    return null;
  }
}
