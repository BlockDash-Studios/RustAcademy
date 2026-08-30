import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UsersService } from './users.service';
import {
  UpdateUserPreferencesDto,
  LearnerPreferencesDto,
  TutorPreferencesDto,
} from './dto/update-preferences.dto';

// ---------------------------------------------------------------------------
// Minimal stubs for the three injected services.
// Only the methods called by UsersService.deleteAccount() are stubbed because
// those are the only non-preference paths that touch the dependencies.
// ---------------------------------------------------------------------------
const makeStubs = () => ({
  onboardingService: {
    findByUserId: jest.fn().mockResolvedValue(null),
    remove: jest.fn().mockResolvedValue(undefined),
  },
  analyticsService: {
    getEventsByUserId: jest.fn().mockResolvedValue([]),
    removeEventsByUserId: jest.fn().mockResolvedValue(undefined),
  },
  socialService: {
    getPostsByUserId: jest.fn().mockReturnValue([]),
    deletePost: jest.fn(),
  },
});

// ---------------------------------------------------------------------------
// Helper: run class-validator on a plain object as a given DTO class.
// Mirrors what the global ValidationPipe does (transform + whitelist).
// ---------------------------------------------------------------------------
async function validateDto<T extends object>(
  cls: new () => T,
  plain: Record<string, unknown>,
) {
  const instance = plainToInstance(cls, plain);
  return validate(instance, { whitelist: true, forbidNonWhitelisted: true });
}

// ---------------------------------------------------------------------------
// DTO validation tests
// ---------------------------------------------------------------------------
describe('UpdateUserPreferencesDto — DTO validation', () => {
  describe('LearnerPreferencesDto', () => {
    it('accepts an empty object (all fields optional)', async () => {
      const errors = await validateDto(LearnerPreferencesDto, {});
      expect(errors).toHaveLength(0);
    });

    it('accepts every valid field at once', async () => {
      const errors = await validateDto(LearnerPreferencesDto, {
        theme: 'dark',
        email_alerts: true,
        push_notifications: false,
        marketing_updates: true,
        displayName: 'Alice',
        email: 'alice@example.com',
        avatarUrl: 'https://cdn.example.com/avatar.png',
      });
      expect(errors).toHaveLength(0);
    });

    describe('theme', () => {
      it.each(['light', 'dark', 'system'])(
        'accepts allow-listed value "%s"',
        async (value) => {
          const errors = await validateDto(LearnerPreferencesDto, { theme: value });
          expect(errors).toHaveLength(0);
        },
      );

      it('rejects an unknown theme value', async () => {
        const errors = await validateDto(LearnerPreferencesDto, { theme: 'midnight' });
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('theme');
      });

      it('rejects a numeric theme value', async () => {
        const errors = await validateDto(LearnerPreferencesDto, { theme: 1 });
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('theme');
      });
    });

    describe('boolean flags', () => {
      it.each(['email_alerts', 'push_notifications', 'marketing_updates'])(
        '%s rejects a string value',
        async (field) => {
          const errors = await validateDto(LearnerPreferencesDto, { [field]: 'yes' });
          expect(errors.length).toBeGreaterThan(0);
          expect(errors[0].property).toBe(field);
        },
      );

      it.each(['email_alerts', 'push_notifications', 'marketing_updates'])(
        '%s rejects a numeric value',
        async (field) => {
          const errors = await validateDto(LearnerPreferencesDto, { [field]: 1 });
          expect(errors.length).toBeGreaterThan(0);
          expect(errors[0].property).toBe(field);
        },
      );
    });

    describe('displayName', () => {
      it('accepts a string within the 200-char limit', async () => {
        const errors = await validateDto(LearnerPreferencesDto, {
          displayName: 'Alice Rust',
        });
        expect(errors).toHaveLength(0);
      });

      it('rejects a string exceeding 200 characters', async () => {
        const errors = await validateDto(LearnerPreferencesDto, {
          displayName: 'a'.repeat(201),
        });
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('displayName');
      });

      it('accepts a string of exactly 200 characters', async () => {
        const errors = await validateDto(LearnerPreferencesDto, {
          displayName: 'a'.repeat(200),
        });
        expect(errors).toHaveLength(0);
      });

      it('rejects a non-string value', async () => {
        const errors = await validateDto(LearnerPreferencesDto, { displayName: 42 });
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('displayName');
      });
    });

    describe('email', () => {
      it('accepts a valid email address', async () => {
        const errors = await validateDto(LearnerPreferencesDto, {
          email: 'user@example.com',
        });
        expect(errors).toHaveLength(0);
      });

      it('rejects a non-email string', async () => {
        const errors = await validateDto(LearnerPreferencesDto, {
          email: 'not-an-email',
        });
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('email');
      });
    });

    describe('avatarUrl', () => {
      it('accepts a valid HTTPS URL', async () => {
        const errors = await validateDto(LearnerPreferencesDto, {
          avatarUrl: 'https://cdn.example.com/pic.jpg',
        });
        expect(errors).toHaveLength(0);
      });

      it('rejects a plain string that is not a URL', async () => {
        const errors = await validateDto(LearnerPreferencesDto, {
          avatarUrl: 'not a url',
        });
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('avatarUrl');
      });
    });

    describe('unknown keys', () => {
      it('rejects an unexpected top-level key', async () => {
        const errors = await validateDto(LearnerPreferencesDto, {
          theme: 'dark',
          hackerField: 'payload',
        });
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((e) => e.property === 'hackerField')).toBe(true);
      });

      it('rejects a numeric arbitrary key', async () => {
        const errors = await validateDto(LearnerPreferencesDto, {
          injectedScore: 9999,
        });
        expect(errors.length).toBeGreaterThan(0);
      });
    });
  });

  describe('TutorPreferencesDto', () => {
    it('accepts an empty object', async () => {
      const errors = await validateDto(TutorPreferencesDto, {});
      expect(errors).toHaveLength(0);
    });

    describe('availability', () => {
      it.each(['weekdays', 'weekends', 'both', 'none'])(
        'accepts allow-listed value "%s"',
        async (value) => {
          const errors = await validateDto(TutorPreferencesDto, { availability: value });
          expect(errors).toHaveLength(0);
        },
      );

      it('rejects an unknown availability value', async () => {
        const errors = await validateDto(TutorPreferencesDto, {
          availability: 'anytime',
        });
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('availability');
      });
    });

    describe('sessionLanguage', () => {
      it('accepts a short language string', async () => {
        const errors = await validateDto(TutorPreferencesDto, {
          sessionLanguage: 'English',
        });
        expect(errors).toHaveLength(0);
      });

      it('rejects a string exceeding 200 characters', async () => {
        const errors = await validateDto(TutorPreferencesDto, {
          sessionLanguage: 'x'.repeat(201),
        });
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('sessionLanguage');
      });

      it('rejects a non-string value', async () => {
        const errors = await validateDto(TutorPreferencesDto, {
          sessionLanguage: true,
        });
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('sessionLanguage');
      });
    });

    it('rejects an unexpected key', async () => {
      const errors = await validateDto(TutorPreferencesDto, {
        availability: 'weekdays',
        evilKey: 'bad',
      });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'evilKey')).toBe(true);
    });
  });

  describe('UpdateUserPreferencesDto (outer wrapper)', () => {
    it('accepts an empty body (both sub-objects optional)', async () => {
      const errors = await validateDto(UpdateUserPreferencesDto, {});
      expect(errors).toHaveLength(0);
    });

    it('accepts a payload with only learnerPreferences', async () => {
      const errors = await validateDto(UpdateUserPreferencesDto, {
        learnerPreferences: { theme: 'light' },
      });
      expect(errors).toHaveLength(0);
    });

    it('accepts a payload with only tutorPreferences', async () => {
      const errors = await validateDto(UpdateUserPreferencesDto, {
        tutorPreferences: { availability: 'weekdays' },
      });
      expect(errors).toHaveLength(0);
    });

    it('rejects an unknown top-level key', async () => {
      const errors = await validateDto(UpdateUserPreferencesDto, {
        learnerPreferences: { theme: 'dark' },
        rogue: 'value',
      });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'rogue')).toBe(true);
    });

    it('propagates nested validation errors from learnerPreferences', async () => {
      const errors = await validateDto(UpdateUserPreferencesDto, {
        learnerPreferences: { theme: 'invalid-theme' },
      });
      expect(errors.length).toBeGreaterThan(0);
      const nested = errors.find((e) => e.property === 'learnerPreferences');
      expect(nested).toBeDefined();
    });

    it('propagates nested validation errors from tutorPreferences', async () => {
      const errors = await validateDto(UpdateUserPreferencesDto, {
        tutorPreferences: { availability: 'whenever' },
      });
      expect(errors.length).toBeGreaterThan(0);
      const nested = errors.find((e) => e.property === 'tutorPreferences');
      expect(nested).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Service-level tests
// ---------------------------------------------------------------------------
describe('UsersService', () => {
  let service: UsersService;
  let stubs: ReturnType<typeof makeStubs>;

  beforeEach(() => {
    stubs = makeStubs();
    service = new UsersService(
      stubs.onboardingService as never,
      stubs.analyticsService as never,
      stubs.socialService as never,
    );
  });

  // ── updatePreferences ────────────────────────────────────────────────────

  describe('updatePreferences()', () => {
    it('stores and returns learner and tutor preferences for a new user', async () => {
      const result = await service.updatePreferences('user-1', {
        learnerPreferences: { theme: 'dark' },
        tutorPreferences: { availability: 'weekends' },
      });

      expect(result).toEqual(
        expect.objectContaining({
          userId: 'user-1',
          learnerPreferences: expect.objectContaining({ theme: 'dark' }),
          tutorPreferences: expect.objectContaining({ availability: 'weekends' }),
        }),
      );
    });

    it('merges a partial update onto existing learner preferences', async () => {
      await service.updatePreferences('user-2', {
        learnerPreferences: { theme: 'light', email_alerts: true },
      });

      const result = await service.updatePreferences('user-2', {
        learnerPreferences: { email_alerts: false },
      });

      // email_alerts overwritten; theme retained from first call
      expect(result.learnerPreferences?.email_alerts).toBe(false);
      expect(result.learnerPreferences?.theme).toBe('light');
    });

    it('does not bleed learner preferences across different user IDs', async () => {
      await service.updatePreferences('user-a', {
        learnerPreferences: { theme: 'dark' },
      });

      const result = await service.updatePreferences('user-b', {
        learnerPreferences: { theme: 'light' },
      });

      expect(result.learnerPreferences?.theme).toBe('light');
    });

    it('returns an empty preference object when neither sub-object is supplied', async () => {
      const result = await service.updatePreferences('user-3', {});

      expect(result).toEqual(
        expect.objectContaining({
          userId: 'user-3',
          learnerPreferences: {},
          tutorPreferences: {},
        }),
      );
    });
  });

  // ── getUserNotificationPreferences ───────────────────────────────────────

  describe('getUserNotificationPreferences()', () => {
    it('returns default-enabled notification preferences for a user with no stored prefs', async () => {
      const prefs = await service.getUserNotificationPreferences('new-user');

      expect(prefs).toEqual({
        userId: 'new-user',
        email_alerts: true,
        push_notifications: true,
        marketing_updates: false,
      });
    });

    it('reflects stored boolean preferences accurately', async () => {
      await service.updatePreferences('user-notif', {
        learnerPreferences: {
          email_alerts: false,
          push_notifications: true,
          marketing_updates: true,
        },
      });

      const prefs = await service.getUserNotificationPreferences('user-notif');

      expect(prefs.email_alerts).toBe(false);
      expect(prefs.push_notifications).toBe(true);
      expect(prefs.marketing_updates).toBe(true);
    });
  });

  // ── getUserProfileFields ─────────────────────────────────────────────────

  describe('getUserProfileFields()', () => {
    it('returns safe undefined defaults for a user with no stored prefs', async () => {
      const fields = await service.getUserProfileFields('ghost-user');

      expect(fields).toEqual({
        userId: 'ghost-user',
        name: undefined,
        email: undefined,
        displayName: undefined,
        avatarUrl: undefined,
      });
    });

    it('maps stored learner preference fields to profile fields', async () => {
      await service.updatePreferences('user-profile', {
        learnerPreferences: {
          displayName: 'Bob',
          email: 'bob@example.com',
          avatarUrl: 'https://cdn.example.com/bob.png',
        },
      });

      const fields = await service.getUserProfileFields('user-profile');

      expect(fields.name).toBe('Bob');
      expect(fields.displayName).toBe('Bob');
      expect(fields.email).toBe('bob@example.com');
      expect(fields.avatarUrl).toBe('https://cdn.example.com/bob.png');
    });
  });
});
