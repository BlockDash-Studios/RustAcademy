import { Profile } from "@/types/profile";

/**
 * Get the public RustAcademy API base URL (for browser/frontend calls)
 * Override in `.env.local`: `NEXT_PUBLIC_RustAcademy_API_URL=https://api.example.com`
 */
export const getRustAcademyApiBase = (): string =>
  process.env.NEXT_PUBLIC_RustAcademy_API_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";

/**
 * Get the internal RustAcademy API base URL (for server-side calls)
 * Falls back to the public base URL if not set
 */
export const getRustAcademyInternalApiBase = (): string =>
  process.env.RustAcademy_INTERNAL_API_URL?.replace(/\/$/, "") ||
  getRustAcademyApiBase();

/**
 * Get the site URL (for OpenGraph metadata, etc.)
 * Falls back to the API base URL (with port adjusted for development)
 */
export const getSiteUrl = (): string => {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  
  const apiBase = getRustAcademyApiBase();
  if (apiBase.includes("localhost:4000")) {
    return apiBase.replace(":4000", ":3000");
  }
  return apiBase || "https://RustAcademy.to";
};

/**
 * Simulate API call to fetch a user profile, with localStorage fallback.
 */
export async function getProfile(username: string): Promise<Profile> {
  // Simulate network latency
  await new Promise((resolve) => setTimeout(resolve, 500));

  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(`profile_${username}`);
    if (stored) {
      try {
        return JSON.parse(stored) as Profile;
      } catch (e) {
        console.error("Failed to parse stored profile:", e);
      }
    }
  }

  // Return default profile
  return {
    username,
    primaryColor: "#6366f1",
    avatarUrl: "",
    bio: "",
    twitterHandle: "",
    discordHandle: "",
    githubHandle: "",
  };
}

/**
 * Simulate API call to save a user profile, persisting to localStorage.
 */
export async function saveProfile(profile: Profile): Promise<Profile> {
  // Simulate network latency
  await new Promise((resolve) => setTimeout(resolve, 800));

  if (typeof window !== "undefined") {
    localStorage.setItem(`profile_${profile.username}`, JSON.stringify(profile));
  }
  return profile;
}
