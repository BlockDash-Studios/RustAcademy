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
