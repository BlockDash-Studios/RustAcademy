import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Localized string keys for admin and learner flows.
 */
export interface LocalizationStrings {
  // ── Admin dashboard ──────────────────────────────────────
  'admin.dashboard.title': string;
  'admin.dashboard.totalUsers': string;
  'admin.dashboard.activeTutors': string;
  'admin.dashboard.totalCourses': string;
  'admin.dashboard.completionRate': string;

  // ── Admin analytics ──────────────────────────────────────
  'admin.analytics.overview': string;
  'admin.analytics.export': string;
  'admin.analytics.exportDescription': string;

  // ── Learner onboarding ──────────────────────────────────
  'onboarding.welcome': string;
  'onboarding.step.profile': string;
  'onboarding.step.wallet': string;
  'onboarding.step.firstLesson': string;
  'onboarding.complete': string;
  'onboarding.inProgress': string;

  // ── Learner dashboard ───────────────────────────────────
  'learner.dashboard.title': string;
  'learner.dashboard.streak': string;
  'learner.dashboard.xpEarned': string;
  'learner.dashboard.coursesInProgress': string;

  // ── Notifications ───────────────────────────────────────
  'notification.welcome': string;
  'notification.milestone': string;
  'notification.submissionGraded': string;
  'notification.courseCompleted': string;
  'notification.contentFlagged': string;
  'notification.contentApproved': string;
  'notification.contentRejected': string;

  // ── General ─────────────────────────────────────────────
  'general.loading': string;
  'general.error': string;
  'general.success': string;
  'general.noResults': string;

  // ── API info ────────────────────────────────────────────
  'api.name': string;
  'api.status': string;
}

const DEFAULT_LOCALE = 'en';

const STRINGS: Record<string, LocalizationStrings> = {
  en: {
    'admin.dashboard.title': 'Admin Dashboard',
    'admin.dashboard.totalUsers': 'Total Users',
    'admin.dashboard.activeTutors': 'Active Tutors',
    'admin.dashboard.totalCourses': 'Total Courses',
    'admin.dashboard.completionRate': 'Completion Rate',

    'admin.analytics.overview': 'Analytics Overview',
    'admin.analytics.export': 'Export Analytics',
    'admin.analytics.exportDescription': 'Download analytics data as CSV',

    'onboarding.welcome': 'Welcome to RustAcademy!',
    'onboarding.step.profile': 'Create your profile',
    'onboarding.step.wallet': 'Connect your wallet',
    'onboarding.step.firstLesson': 'Complete your first lesson',
    'onboarding.complete': 'Onboarding complete!',
    'onboarding.inProgress': 'Onboarding in progress',

    'learner.dashboard.title': 'My Dashboard',
    'learner.dashboard.streak': 'Current Streak',
    'learner.dashboard.xpEarned': 'XP Earned',
    'learner.dashboard.coursesInProgress': 'Courses In Progress',

    'notification.welcome': 'Welcome to RustAcademy! Start your first lesson today.',
    'notification.milestone': 'Congratulations on reaching a new milestone!',
    'notification.submissionGraded': 'Your submission has been graded.',
    'notification.courseCompleted': 'You have completed the course!',
    'notification.contentFlagged': 'Your content has been flagged for moderation review.',
    'notification.contentApproved': 'Your content has been approved by moderation.',
    'notification.contentRejected': 'Your content has been rejected by moderation.',

    'general.loading': 'Loading...',
    'general.error': 'An error occurred',
    'general.success': 'Operation completed successfully',
    'general.noResults': 'No results found',

    'api.name': 'RustAcademy API',
    'api.status': 'ok',
  },
};

@Injectable()
export class LocalizationService {
  private readonly logger = new Logger(LocalizationService.name);
  private locale: string;

  constructor(private readonly configService: ConfigService) {
    this.locale = this.configService.get<string>('LOCALE') || DEFAULT_LOCALE;
    this.logger.log(`LocalizationService initialized with locale: ${this.locale}`);
  }

  /**
   * Translates a key into the current locale.
   * Falls back to 'en' if the locale or key is not found.
   */
  t(key: keyof LocalizationStrings): string {
    const localeStrings = STRINGS[this.locale] ?? STRINGS[DEFAULT_LOCALE];
    return localeStrings[key] ?? `[missing: ${key}]`;
  }

  /**
   * Sets the current locale at runtime.
   */
  setLocale(locale: string): void {
    if (STRINGS[locale]) {
      this.locale = locale;
      this.logger.log(`Locale changed to: ${locale}`);
    } else {
      this.logger.warn(`Locale '${locale}' not found, falling back to '${DEFAULT_LOCALE}'`);
      this.locale = DEFAULT_LOCALE;
    }
  }

  /**
   * Returns the current locale.
   */
  getLocale(): string {
    return this.locale;
  }

  /**
   * Returns all available locales.
   */
  getAvailableLocales(): string[] {
    return Object.keys(STRINGS);
  }
}
