import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getProfile,
  getProfileStorageKey,
  readStoredProfileMetadata,
  saveProfile,
  ProfileNotFoundError,
} from "../api";
import { PROFILE_METADATA_DEFAULTS } from "@/types/profile";

const VALID_BACKEND_PROFILE = {
  id: "1",
  username: "alice",
  publicKey: "GAAA...",
  lastActiveAt: "2026-04-23T09:00:00.000Z",
  createdAt: "2026-04-01T09:00:00.000Z",
};

describe("getProfileStorageKey", () => {
  it("normalizes the username to lowercase", () => {
    expect(getProfileStorageKey("Alice")).toBe("profile_alice");
    expect(getProfileStorageKey("ALICE")).toBe("profile_alice");
  });
});

describe("readStoredProfileMetadata", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns defaults when nothing is stored", () => {
    expect(readStoredProfileMetadata("alice")).toEqual(PROFILE_METADATA_DEFAULTS);
  });

  it("merges stored metadata and drops invalid fields", () => {
    localStorage.setItem(
      "profile_alice",
      JSON.stringify({
        primaryColor: "not-a-color",
        bio: "Hi there",
        extra: "ignored",
      })
    );

    expect(readStoredProfileMetadata("alice")).toEqual({
      ...PROFILE_METADATA_DEFAULTS,
      bio: "Hi there",
    });
  });

  it("removes malformed JSON and returns defaults", () => {
    localStorage.setItem("profile_alice", "{not json");

    expect(readStoredProfileMetadata("alice")).toEqual(PROFILE_METADATA_DEFAULTS);
    expect(localStorage.getItem("profile_alice")).toBeNull();
  });

  it("removes non-object payloads", () => {
    localStorage.setItem("profile_alice", JSON.stringify(["a", "b"]));

    expect(readStoredProfileMetadata("alice")).toEqual(PROFILE_METADATA_DEFAULTS);
    expect(localStorage.getItem("profile_alice")).toBeNull();
  });

  it("reads through the canonical lowercase key", () => {
    localStorage.setItem("profile_alice", JSON.stringify({ bio: "hey" }));

    expect(readStoredProfileMetadata("Alice").bio).toBe("hey");
  });
});

describe("getProfile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("returns a merged profile from backend and localStorage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          profiles: [VALID_BACKEND_PROFILE],
          total: 1,
          has_more: false,
        }),
      })
    );
    localStorage.setItem(
      "profile_alice",
      JSON.stringify({ bio: "Hey there", primaryColor: "#12abef" })
    );

    const profile = await getProfile("Alice");

    expect(profile).toEqual({
      username: "alice",
      publicKey: "GAAA...",
      ...PROFILE_METADATA_DEFAULTS,
      bio: "Hey there",
      primaryColor: "#12abef",
    });
  });

  it("throws ProfileNotFoundError when there is no exact match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          profiles: [
            { ...VALID_BACKEND_PROFILE, username: "bob" },
          ],
          total: 1,
          has_more: false,
        }),
      })
    );

    await expect(getProfile("alice")).rejects.toBeInstanceOf(ProfileNotFoundError);
  });

  it("surfaces network failures with friendly copy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed"))
    );

    await expect(getProfile("alice")).rejects.toThrow(
      "Unable to connect to the backend"
    );
  });
});

describe("saveProfile", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("sanitizes and persists the profile under a lowercase key", async () => {
    const saved = await saveProfile({
      username: "Alice",
      primaryColor: "bad",
      avatarUrl: "not-a-url",
      bio: "ok",
      twitterHandle: "alice",
      discordHandle: "",
      githubHandle: "",
    });

    expect(saved.username).toBe("alice");
    expect(saved.primaryColor).toBe(PROFILE_METADATA_DEFAULTS.primaryColor);
    expect(saved.avatarUrl).toBe("");

    const stored = JSON.parse(localStorage.getItem("profile_alice") as string);
    expect(stored.username).toBe("alice");
    expect(stored.bio).toBe("ok");
  });
});
