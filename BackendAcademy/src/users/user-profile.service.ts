import { Injectable, BadRequestException } from '@nestjs/common';
import { UserProfileEntity } from './user-profile.entity';

/**
 * #352: Profile validation rules for display names and bios.
 * Enforced on both create and update to prevent XSS, profanity,
 * and spam from polluting the platform.
 */
export interface ProfileValidationRules {
  displayName: {
    minLength: number;
    maxLength: number;
    /** Regex pattern — only letters, numbers, underscores, hyphens, spaces. */
    pattern: RegExp;
  };
  bio: {
    maxLength: number;
  };
}

const DEFAULT_VALIDATION_RULES: ProfileValidationRules = {
  displayName: {
    minLength: 2,
    maxLength: 40,
    pattern: /^[a-zA-Z0-9 _\-]+$/,
  },
  bio: {
    maxLength: 300,
  },
};

/**
 * Words blocked from display names and bios.
 * kept minimal — extend as needed via config.
 */
const BLOCKED_TERMS = [
  'admin',
  'moderator',
  'support',
  'official',
  'system',
];

@Injectable()
export class UserProfileService {
  private readonly profiles: Map<string, UserProfileEntity> = new Map();
  private readonly validationRules: ProfileValidationRules = DEFAULT_VALIDATION_RULES;

  /**
   * #352: Validates a display name against all rules.
   * Returns an array of error messages (empty = valid).
   */
  validateDisplayName(displayName: string): string[] {
    const errors: string[] = [];
    const trimmed = displayName.trim();

    if (trimmed.length < this.validationRules.displayName.minLength) {
      errors.push(
        `Display name must be at least ${this.validationRules.displayName.minLength} characters`,
      );
    }

    if (trimmed.length > this.validationRules.displayName.maxLength) {
      errors.push(
        `Display name must be at most ${this.validationRules.displayName.maxLength} characters`,
      );
    }

    if (!this.validationRules.displayName.pattern.test(trimmed)) {
      errors.push(
        'Display name may only contain letters, numbers, underscores, hyphens, and spaces',
      );
    }

    const lowerName = trimmed.toLowerCase();
    for (const term of BLOCKED_TERMS) {
      if (lowerName.includes(term)) {
        errors.push(
          `Display name may not contain the reserved term "${term}"`,
        );
        break;
      }
    }

    return errors;
  }

  /**
   * #352: Validates a bio against all rules.
   */
  validateBio(bio: string): string[] {
    const errors: string[] = [];
    const trimmed = bio.trim();

    if (trimmed.length > this.validationRules.bio.maxLength) {
      errors.push(
        `Bio must be at most ${this.validationRules.bio.maxLength} characters`,
      );
    }

    const lowerBio = trimmed.toLowerCase();
    for (const term of BLOCKED_TERMS) {
      if (lowerBio.includes(term)) {
        errors.push(`Bio may not contain the reserved term "${term}"`);
        break;
      }
    }

    return errors;
  }

  /**
   * #352: Full profile validation — runs both display name and bio checks.
   * Throws BadRequestException if any validation fails.
   */
  private validateProfile(data: Partial<UserProfileEntity>): void {
    const errors: string[] = [];

    if (data.displayName !== undefined) {
      errors.push(...this.validateDisplayName(data.displayName));
    }

    if (data.bio !== undefined) {
      errors.push(...this.validateBio(data.bio));
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Profile validation failed',
        errors,
      });
    }
  }

  async create(profile: Partial<UserProfileEntity>): Promise<UserProfileEntity> {
    this.validateProfile(profile);

    const entity = new UserProfileEntity({
      id: crypto.randomUUID(),
      ...profile,
    });
    this.profiles.set(entity.id, entity);
    return entity;
  }

  async findAll(): Promise<UserProfileEntity[]> {
    return Array.from(this.profiles.values());
  }

  async findById(id: string): Promise<UserProfileEntity | null> {
    return this.profiles.get(id) || null;
  }

  async findByUserId(userId: string): Promise<UserProfileEntity | null> {
    return Array.from(this.profiles.values()).find(p => p.userId === userId) || null;
  }

  async update(id: string, updates: Partial<UserProfileEntity>): Promise<UserProfileEntity> {
    const profile = this.profiles.get(id);
    if (!profile) {
      throw new BadRequestException({ statusCode: 404, message: 'Profile not found' });
    }

    this.validateProfile({ ...profile, ...updates });

    Object.assign(profile, updates, { updatedAt: new Date() });
    return profile;
  }

  async remove(id: string): Promise<boolean> {
    return this.profiles.delete(id);
  }
}
