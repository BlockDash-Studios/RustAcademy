import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Notification } from './interfaces/notifications.interface';
import {
  INotificationProvider,
  DeliveryResult,
  DeliveryContext,
  NotificationPriority,
  NOTIFICATION_PROVIDERS,
} from './interfaces/notification-provider.interface';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationPreferences } from './interfaces/preferences.interface';
import { LocalizationService } from '../i18n/localization.service';
import { CorrelationLoggerService } from '../logging/logger.service';

/**
 * Batch configuration for low-priority notifications.
 */
export interface BatchConfig {
  maxBatchSize: number;
  batchWindowMs: number;
  enabled: boolean;
}

/**
 * Result of a batch delivery operation.
 */
export interface BatchDeliveryResult {
  batchId: string;
  totalCount: number;
  successCount: number;
  failureCount: number;
  results: DeliveryResult[];
  flushedAt: Date;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private notifications: Notification[] = [];
  private preferences: Map<string, NotificationPreferences> = new Map();
  private readonly defaultTimeoutMs: number;

  /** Pending low-priority notifications awaiting batch flush */
  private pendingBatch: Notification[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;

  private batchConfig: BatchConfig = {
    maxBatchSize: 10,
    batchWindowMs: 30_000,
    enabled: false,
  };

  // ── Default localized notification templates ────────────────
  static readonly TEMPLATES: Record<
    string,
    {
      titleKey: string;
      messageKey: string;
    }
  > = {
    welcome: {
      titleKey: 'notification.welcome',
      messageKey: 'notification.welcome',
    },
    milestone: {
      titleKey: 'notification.milestone',
      messageKey: 'notification.milestone',
    },
    submissionGraded: {
      titleKey: 'notification.submissionGraded',
      messageKey: 'notification.submissionGraded',
    },
    courseCompleted: {
      titleKey: 'notification.courseCompleted',
      messageKey: 'notification.courseCompleted',
    },
    // #357: Certificate generation notification
    certificateGenerated: {
      titleKey: 'notification.certificateGenerated',
      messageKey: 'notification.certificateGenerated',
    },
    certificateRevoked: {
      titleKey: 'notification.certificateRevoked',
      messageKey: 'notification.certificateRevoked',
    },
    submissionFlagged: {
      titleKey: 'notification.submissionFlagged',
      messageKey: 'notification.submissionFlagged',
    },
    reviewAssigned: {
      titleKey: 'notification.reviewAssigned',
      messageKey: 'notification.reviewAssigned',
    },
    reviewResolved: {
      titleKey: 'notification.reviewResolved',
      messageKey: 'notification.reviewResolved',
    },
    reportTriaged: {
      titleKey: 'notification.reportTriaged',
      messageKey: 'notification.reportTriaged',
    },
    reportEscalated: {
      titleKey: 'notification.reportEscalated',
      messageKey: 'notification.reportEscalated',
    },
    reportResolved: {
      titleKey: 'notification.reportResolved',
      messageKey: 'notification.reportResolved',
    },
    contentFlagged: {
      titleKey: 'notification.contentFlagged',
      messageKey: 'notification.contentFlagged',
    },
    contentApproved: {
      titleKey: 'notification.contentApproved',
      messageKey: 'notification.contentApproved',
    },
    contentRejected: {
      titleKey: 'notification.contentRejected',
      messageKey: 'notification.contentRejected',
    },
    // #365: Content policy violation notification
    contentPolicyViolation: {
      titleKey: 'notification.submissionFlagged',
      messageKey: 'notification.submissionFlagged',
    },
  };

  constructor(
    private readonly l10n: LocalizationService,
    @Optional()
    @Inject(NOTIFICATION_PROVIDERS)
    private readonly providers?: INotificationProvider[],
    @Optional()
    private readonly configService?: ConfigService,
  ) {
    this.defaultTimeoutMs =
      this.configService?.get<number>('DEFAULT_REQUEST_TIMEOUT_MS') ?? 30_000;
  }

  // ── Attachment policy violation notification — #365 ──────────

  /**
   * Creates a notification when an attachment violates content policy.
   */
  createContentPolicyViolationNotification(
    userId: string,
    reason: string,
  ): Notification {
    return this.create({
      userId,
      type: 'in-app',
      title: 'Content Policy Violation',
      message: `Your submission attachment was rejected: ${reason}. Please review the content policy and resubmit.`,
    });
  }

  /**
   * Creates a localized notification using the contentPolicyViolation template.
   */
  notifyContentPolicyViolation(userId: string): Notification {
    return this.createLocalized('system', 'contentPolicyViolation', 'in-app');
  }

  createReportNotification(
    reportId: string,
    templateName: 'reportTriaged' | 'reportEscalated' | 'reportResolved',
  ): Notification {
    return this.createLocalized('system', templateName, 'in-app');
  }

  // ── Batch configuration (#386) ────────────────────────────

  configureBatch(config: Partial<BatchConfig>): void {
    this.batchConfig = { ...this.batchConfig, ...config };
    this.logger.log(
      `Batch config updated: enabled=${this.batchConfig.enabled}, maxSize=${this.batchConfig.maxBatchSize}, windowMs=${this.batchConfig.batchWindowMs}`,
    );
  }

  getBatchConfig(): BatchConfig {
    return { ...this.batchConfig };
  }

  // ── Notification CRUD ────────────────────────────────────

  create(createNotificationDto: CreateNotificationDto): Notification {
    const newNotification: Notification = {
      id: Math.random().toString(36).substring(2, 9),
      ...createNotificationDto,
      isRead: false,
      createdAt: new Date(),
    };
    this.notifications.push(newNotification);
    return newNotification;
  }

  findAll(): Notification[] {
    return this.notifications;
  }

  findByUserId(userId: string): Notification[] {
    return this.notifications.filter((n) => n.userId === userId);
  }

  /**
   * Creates a localized notification using a predefined template.
   */
  createLocalized(
    userId: string,
    templateName: keyof typeof NotificationsService.TEMPLATES,
    type: 'push' | 'in-app' = 'in-app',
  ): Notification {
    const template = NotificationsService.TEMPLATES[templateName];
    if (!template) {
      throw new Error(`Unknown notification template: ${templateName}`);
    }
    return this.create({
      userId,
      type,
      title: this.l10n.t(template.titleKey as any),
      message: this.l10n.t(template.messageKey as any),
    });
  }

  // ── Preference-aware provider delivery (#385) ────────────

  /**
   * Checks whether a user has opted into a given notification channel.
   * Falls back to a sensible default (enabled) when no explicit preference exists.
   */
  private isChannelEnabled(userId: string, channel: keyof NotificationPreferences): boolean {
    const prefs = this.getPreferences(userId);
    return prefs[channel] !== false;
  }

  /**
   * Filters the available providers down to the ones the user has opted into.
   *
   * Maps each provider to its corresponding preference key:
   *   - 'email'  → email_alerts
   *   - 'push'   → push_notifications
   *   - 'in-app' → push_notifications (in-app uses push channel)
   */
  private getEnabledProviders(
    userId: string,
  ): INotificationProvider[] {
    if (!this.providers) return [];

    const channelMap: Record<string, keyof NotificationPreferences> = {
      email: 'email_alerts',
      push: 'push_notifications',
      'in-app': 'push_notifications',
    };

    return this.providers.filter((p) => {
      const prefKey = channelMap[p.providerId];
      if (!prefKey) return true; // unknown providers default to enabled
      return this.isChannelEnabled(userId, prefKey);
    });
  }

  async deliver(
    notification: Notification,
    context: DeliveryContext,
  ): Promise<DeliveryResult[]> {
    const priority = context.priority ?? NotificationPriority.NORMAL;

    if (
      priority === NotificationPriority.LOW &&
      this.batchConfig.enabled &&
      context.batchable !== false
    ) {
      return this.enqueueForBatch(notification, context);
    }

    return this.deliverImmediately(notification, context);
  }

  private async deliverImmediately(
    notification: Notification,
    context: DeliveryContext,
  ): Promise<DeliveryResult[]> {
    const enabledProviders = (this.providers || []).filter((p) =>
      typeof (p as any).isEnabled === 'function' ? (p as any).isEnabled() : true,
    );

    if (enabledProviders.length === 0) {
      this.logger.warn(
        'No notification providers registered — notification stored only',
      );
      return [];
    }

    const results = await Promise.allSettled(
      enabledProviders.map((provider) =>
        provider.send(notification, context),
      ),
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      this.logger.error(
        `Provider ${enabledProviders[index].providerId} failed: ${result.reason}`,
      );
      return {
        success: false,
        message: `Provider error: ${result.reason}`,
        deliveredAt: new Date(),
      };
    });
  }

  // ── Batching (#386) ──────────────────────────────────────

  private async enqueueForBatch(
    notification: Notification,
    context: DeliveryContext,
  ): Promise<DeliveryResult[]> {
    this.pendingBatch.push(notification);
    this.logger.debug(
      `Batched notification (${this.pendingBatch.length}/${this.batchConfig.maxBatchSize})`,
    );

    if (this.pendingBatch.length >= this.batchConfig.maxBatchSize) {
      const batchRes = await this.flushBatch(context);
      return batchRes.results;
    }

    if (!this.batchTimer && this.batchConfig.batchWindowMs > 0) {
      this.batchTimer = setTimeout(() => {
        this.flushBatch(context).catch((err) =>
          this.logger.error(`Batch flush failed: ${(err as Error).message}`),
        );
      }, this.batchConfig.batchWindowMs);
    }

    return [
      {
        success: true,
        message: 'Notification queued for batch delivery',
        deliveredAt: new Date(),
      },
    ];
  }

  async flushBatch(context?: DeliveryContext): Promise<BatchDeliveryResult> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    const batch = [...this.pendingBatch];
    this.pendingBatch = [];

    this.notifications.push(...batch);

    if (batch.length === 0) {
      return {
        batchId: '',
        totalCount: 0,
        successCount: 0,
        failureCount: 0,
        results: [],
        flushedAt: new Date(),
      };
    }

    this.logger.log(`Flushing batch of ${batch.length} notifications`);

    const ctx = context || {
      userId: 'batch',
      priority: NotificationPriority.LOW,
    };
    const allResults: DeliveryResult[] = [];
    const enabledProviders = (this.providers || []).filter((p) =>
      typeof (p as any).isEnabled === 'function' ? (p as any).isEnabled() : true,
    );

    if (enabledProviders.length > 0) {
      for (const provider of enabledProviders) {
        if (provider.sendBatch) {
          const results = await provider.sendBatch(batch, ctx);
          allResults.push(...results);
        } else {
          for (const notification of batch) {
            const result = await provider.send(notification, ctx);
            allResults.push(result);
          }
        }
      }
    }

    const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const successCount = allResults.filter((r) => r.success).length;
    const failureCount = allResults.filter((r) => !r.success).length;

    this.logger.log(
      `Batch ${batchId}: ${successCount} succeeded, ${failureCount} failed`,
    );

    return {
      batchId,
      totalCount: batch.length,
      successCount,
      failureCount,
      results: allResults,
      flushedAt: new Date(),
    };
  }

  getPendingBatchCount(): number {
    return this.pendingBatch.length;
  }

  // ── Preferences ──────────────────────────────────────────

  getPreferences(userId: string): NotificationPreferences {
    return (
      this.preferences.get(userId) ?? {
        userId,
        email_alerts: true,
        push_notifications: true,
        marketing_updates: false,
      }
    );
  }

  upsertPreferences(
    userId: string,
    dto: Partial<NotificationPreferences>,
  ): NotificationPreferences {
    const current = this.getPreferences(userId);
    const updated = { ...current, ...dto, userId };
    this.preferences.set(userId, updated);
    return updated;
  }

  // ── Signed URL notifications ─────────────────────────────

  notifySignedUrlExpiring(
    userId: string,
    assetId: string,
    expiresAt: Date,
  ): Notification {
    return this.create({
      userId,
      type: 'in-app',
      title: 'Signed URL Expiring Soon',
      message: `Your access link for asset ${assetId} will expire at ${expiresAt.toISOString()}. Request a new one if you still need access.`,
    });
  }

  notifyInsufficientScope(
    userId: string,
    assetId: string,
    requiredScope: string,
  ): Notification {
    return this.create({
      userId,
      type: 'in-app',
      title: 'Insufficient Access Scope',
      message: `Your access level for asset ${assetId} does not include "${requiredScope}" permissions.`,
    });
  }

  // ── Provider health ──────────────────────────────────────

  async checkProvidersHealth(): Promise<
    Array<{ providerId: string; healthy: boolean }>
  > {
    if (!this.providers) return [];
    const results = await Promise.all(
      this.providers.map(async (p) => ({
        providerId: p.providerId,
        healthy: await p.healthCheck(),
      })),
    );
    return results;
  }

  /**
   * Sends an outbound push notification with a global request timeout — Issue #408.
   */
  async sendWithTimeout(
    url: string,
    payload: unknown,
    timeoutMs?: number,
  ): Promise<{ success: boolean; error?: string }> {
    const timeout = timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const headers = new Headers({ 'Content-Type': 'application/json' });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
