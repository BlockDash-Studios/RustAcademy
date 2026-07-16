import { Profile } from "@/types/profile";

/**
 * Backend origin for browser calls. Override in `.env.local`:
 * `NEXT_PUBLIC_RustAcademy_API_URL=https://api.example.com`
 */
export const getRustAcademyApiBase = (): string =>
  process.env.NEXT_PUBLIC_RustAcademy_API_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";

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
