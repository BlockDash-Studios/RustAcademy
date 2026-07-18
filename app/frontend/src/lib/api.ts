import { Profile } from "@/types/profile";

/**
 * Backend origin for browser calls. Override in `.env.local`:
 * `NEXT_PUBLIC_RustAcademy_API_URL=https://api.example.com`
 */
export const getRustAcademyApiBase = (): string =>
  process.env.NEXT_PUBLIC_RustAcademy_API_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";

interface BackendPublicProfile {
  id: string;
  username: string;
  publicKey: string;
  lastActiveAt: string;
  createdAt: string;
  similarityScore?: number;
}

interface SearchResponse {
  profiles: BackendPublicProfile[];
  total: number;
  next_cursor?: string;
  has_more: boolean;
}

/**
 * Profile not found error
 */
export class ProfileNotFoundError extends Error {
  constructor(username: string) {
    super(`Profile not found: ${username}`);
    this.name = "ProfileNotFoundError";
  }
}

/**
 * Fetch a public user profile by username from the backend API.
 * 
 * @throws {ProfileNotFoundError} When the username doesn't exist or profile is private
 * @throws {Error} For network or API errors
 */
export async function getProfile(username: string): Promise<Profile> {
  const baseUrl = getRustAcademyApiBase();
  
  try {
    // Search for exact username match using the search endpoint
    const response = await fetch(
      `${baseUrl}/username/search?query=${encodeURIComponent(username)}&limit=1`
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data: SearchResponse = await response.json();

    // Check if we found an exact match
    const profile = data.profiles.find(
      (p) => p.username.toLowerCase() === username.toLowerCase()
    );

    if (!profile) {
      throw new ProfileNotFoundError(username);
    }

    // Check localStorage for additional profile metadata (color, bio, social handles)
    let metadata = {
      primaryColor: "#6366f1",
      avatarUrl: "",
      bio: "",
      twitterHandle: "",
      discordHandle: "",
      githubHandle: "",
    };

    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(`profile_${username}`);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          metadata = { ...metadata, ...parsed };
        } catch (e) {
          console.error("Failed to parse stored profile metadata:", e);
        }
      }
    }

    return {
      username: profile.username,
      publicKey: profile.publicKey,
      ...metadata,
    };
  } catch (error) {
    if (error instanceof ProfileNotFoundError) {
      throw error;
    }
    
    // Network or other errors
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new Error("Unable to connect to the backend. Please check your connection.");
    }
    
    throw error;
  }
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
