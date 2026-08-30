import { Injectable, BadRequestException } from '@nestjs/common';
import { UserProfileEntity } from './user-profile.entity';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';

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

/**
 * BA-040 — Fields that are considered "protected" / non-editable by a
 * client. Any of these keys appearing in a create or update payload will be
 * stripped before the value reaches the store, so a caller cannot escalate
 * privileges or take ownership of a profile by supplying extra fields.
 */
const PROTECTED_FIELDS = new Set([
  'id',
  'userid',
  'createdat',
  'updatedat',
  'role',
  'roles',
  'isverified',
  'verified',
  'verificationstatus',
  'status',
  'owner',
  'ownerid',
  'internal',
]);

/**
 * Returns a copy of `input` with every protected field removed.
 */
function stripProtectedFields<T extends Record<string, unknown>>(
  input: T,
): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!PROTECTED_FIELDS.has(key.toLowerCase())) {
      result[key] = value;
    }
  }
  return result as Partial<T>;
}

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

  async create(dto: CreateUserProfileDto): Promise<UserProfileEntity> {
    // BA-040: only editable fields survive; protected metadata cannot be forged.
    const safe = stripProtectedFields({
      ...dto,
    } as Record<string, unknown>);

    this.validateProfile(safe);

    const entity = new UserProfileEntity({
      id: crypto.randomUUID(),
      ...(safe as Partial<UserProfileEntity>),
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

  async update(id: string, dto: UpdateUserProfileDto): Promise<UserProfileEntity> {
    const profile = this.profiles.get(id);
    if (!profile) {
      throw new BadRequestException({ statusCode: 404, message: 'Profile not found' });
    }

    // BA-040: strip any protected field that a malicious payload injects.
    const safe = stripProtectedFields({
      ...dto,
    } as Record<string, unknown>);

    this.validateProfile({ ...profile, ...safe });

    Object.assign(profile, safe, { updatedAt: new Date() });
    return profile;
  }

  async remove(id: string): Promise<boolean> {
    return this.profiles.delete(id);
  }
}
