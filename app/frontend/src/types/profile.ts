export interface Profile {
  username: string;
  publicKey?: string;
  primaryColor: string;
  avatarUrl: string;
  bio: string;
  twitterHandle: string;
  discordHandle: string;
  githubHandle: string;
}

/**
 * The subset of `Profile` fields that are user-curated and stored in
 * localStorage. `username` and `publicKey` come from the backend API.
 */
export type ProfileMetadata = Pick<
  Profile,
  | "primaryColor"
  | "avatarUrl"
  | "bio"
  | "twitterHandle"
  | "discordHandle"
  | "githubHandle"
>;

/**
 * Fallback values applied when a stored metadata field is missing, empty,
 * or malformed. Keeps the public profile page rendering predictably even
 * when localStorage contains corrupt or unexpected data.
 */
export const PROFILE_METADATA_DEFAULTS: ProfileMetadata = {
  primaryColor: "#6366f1",
  avatarUrl: "",
  bio: "",
  twitterHandle: "",
  discordHandle: "",
  githubHandle: "",
};

const PROFILE_METADATA_FIELD_KEYS = Object.keys(
  PROFILE_METADATA_DEFAULTS,
) as (keyof ProfileMetadata)[];

function isValidHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function sanitizeString(
  value: unknown,
  maxLength: number,
  pattern?: RegExp,
): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim().slice(0, maxLength);
  if (pattern && !pattern.test(trimmed)) {
    return "";
  }
  return trimmed;
}

/**
 * Sanitize arbitrary (possibly malformed) data read from localStorage into a
 * well-formed `ProfileMetadata` object.
 *
 * Every field is validated and typed individually:
 * - non-string values fall back to the default,
 * - `primaryColor` must be a 6-digit hex color,
 * - `avatarUrl` must be an absolute http(s) URL,
 * - handles/bio are trimmed and length-capped.
 *
 * Invalid input never throws — it degrades to the default for that field so
 * callers can merge the result safely.
 */
export function sanitizeProfileMetadata(raw: unknown): ProfileMetadata {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...PROFILE_METADATA_DEFAULTS };
  }

  const candidate = raw as Record<string, unknown>;
  const metadata = { ...PROFILE_METADATA_DEFAULTS };

  for (const key of PROFILE_METADATA_FIELD_KEYS) {
    const value = candidate[key];

    switch (key) {
      case "primaryColor":
        if (typeof value === "string" && isValidHexColor(value)) {
          metadata.primaryColor = value;
        }
        break;
      case "avatarUrl":
        if (
          typeof value === "string" &&
          value.trim() !== "" &&
          isValidUrl(value)
        ) {
          metadata.avatarUrl = value.slice(0, 2048);
        }
        break;
      case "bio":
        metadata.bio = sanitizeString(value, 160);
        break;
      case "twitterHandle":
        metadata.twitterHandle = sanitizeString(value, 15, /^[a-zA-Z0-9_]+$/);
        break;
      case "discordHandle":
        metadata.discordHandle = sanitizeString(
          value,
          32,
          /^[a-zA-Z0-9_.#]+$/,
        );
        break;
      case "githubHandle":
        metadata.githubHandle = sanitizeString(
          value,
          39,
          /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/,
        );
        break;
    }
  }

  return metadata;
}

export type ProfileValidationErrors = Partial<Record<keyof Profile, string>>;

export function validateProfile(profile: Profile): { isValid: boolean; errors: ProfileValidationErrors } {
  const errors: ProfileValidationErrors = {};

  // Username validation
  if (!profile.username) {
    errors.username = "Username is required";
  } else if (profile.username.length < 3 || profile.username.length > 32) {
    errors.username = "Username must be between 3 and 32 characters";
  } else if (!/^[a-z0-9_]+$/.test(profile.username)) {
    errors.username = "Username must contain only lowercase letters, numbers, and underscores";
  }

  // Primary Color validation
  if (!profile.primaryColor) {
    errors.primaryColor = "Primary color is required";
  } else if (!/^#[0-9a-fA-F]{6}$/.test(profile.primaryColor)) {
    errors.primaryColor = "Must be a valid hex color code (e.g. #6366f1)";
  }

  // Avatar URL validation
  if (profile.avatarUrl) {
    try {
      const url = new URL(profile.avatarUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        errors.avatarUrl = "URL must use http or https protocol";
      }
    } catch {
      errors.avatarUrl = "Must be a valid URL";
    }
  }

  // Bio validation
  if (profile.bio && profile.bio.length > 160) {
    errors.bio = "Bio cannot exceed 160 characters";
  }

  // Twitter handle validation
  if (profile.twitterHandle) {
    if (profile.twitterHandle.length > 15) {
      errors.twitterHandle = "Twitter handle cannot exceed 15 characters";
    } else if (!/^[a-zA-Z0-9_]+$/.test(profile.twitterHandle)) {
      errors.twitterHandle = "Twitter handle must contain only alphanumeric characters and underscores";
    }
  }

  // Discord handle validation
  if (profile.discordHandle) {
    if (profile.discordHandle.length < 2 || profile.discordHandle.length > 32) {
      errors.discordHandle = "Discord handle must be between 2 and 32 characters";
    } else if (!/^[a-zA-Z0-9_.#]+$/.test(profile.discordHandle)) {
      errors.discordHandle = "Discord handle must contain only alphanumeric characters, underscores, periods, and #";
    }
  }

  // GitHub handle validation
  if (profile.githubHandle) {
    if (profile.githubHandle.length > 39) {
      errors.githubHandle = "GitHub handle cannot exceed 39 characters";
    } else if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/.test(profile.githubHandle)) {
      errors.githubHandle = "Invalid GitHub handle format";
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
