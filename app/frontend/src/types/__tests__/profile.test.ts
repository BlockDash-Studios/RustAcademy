import { describe, it, expect } from "vitest";
import {
  PROFILE_METADATA_DEFAULTS,
  sanitizeProfileMetadata,
} from "../profile";

describe("sanitizeProfileMetadata", () => {
  it("returns defaults for non-object input", () => {
    expect(sanitizeProfileMetadata(null)).toEqual(PROFILE_METADATA_DEFAULTS);
    expect(sanitizeProfileMetadata(undefined)).toEqual(PROFILE_METADATA_DEFAULTS);
    expect(sanitizeProfileMetadata("oops")).toEqual(PROFILE_METADATA_DEFAULTS);
    expect(sanitizeProfileMetadata(42)).toEqual(PROFILE_METADATA_DEFAULTS);
    expect(sanitizeProfileMetadata(["a", "b"])).toEqual(PROFILE_METADATA_DEFAULTS);
  });

  it("keeps valid values unchanged", () => {
    const result = sanitizeProfileMetadata({
      primaryColor: "#ff00aa",
      avatarUrl: "https://example.com/avatar.png",
      bio: "Hello world",
      twitterHandle: "alice",
      discordHandle: "alice#1234",
      githubHandle: "alice-dev",
    });

    expect(result).toEqual({
      primaryColor: "#ff00aa",
      avatarUrl: "https://example.com/avatar.png",
      bio: "Hello world",
      twitterHandle: "alice",
      discordHandle: "alice#1234",
      githubHandle: "alice-dev",
    });
  });

  it("rejects invalid hex colors", () => {
    expect(sanitizeProfileMetadata({ primaryColor: "red" }).primaryColor).toBe(
      PROFILE_METADATA_DEFAULTS.primaryColor
    );
    expect(sanitizeProfileMetadata({ primaryColor: "#FFF" }).primaryColor).toBe(
      PROFILE_METADATA_DEFAULTS.primaryColor
    );
    expect(
      sanitizeProfileMetadata({ primaryColor: "#gggiii" }).primaryColor
    ).toBe(PROFILE_METADATA_DEFAULTS.primaryColor);
  });

  it("rejects non-URL avatar values", () => {
    expect(sanitizeProfileMetadata({ avatarUrl: "not-a-url" }).avatarUrl).toBe("");
    expect(
      sanitizeProfileMetadata({ avatarUrl: "/relative.png" }).avatarUrl
    ).toBe("");
    expect(
      sanitizeProfileMetadata({ avatarUrl: "javascript:alert(1)" }).avatarUrl
    ).toBe("");
  });

  it("drops non-string fields", () => {
    const result = sanitizeProfileMetadata({
      bio: 123,
      twitterHandle: null,
      primaryColor: 5,
      githubHandle: ["nope"],
    });

    expect(result.bio).toBe("");
    expect(result.twitterHandle).toBe("");
    expect(result.githubHandle).toBe("");
  });

  it("trims and length-caps fields", () => {
    const result = sanitizeProfileMetadata({
      bio: `  ${"x".repeat(200)}  `,
      discordHandle: "x".repeat(40),
    });

    expect(result.bio).toHaveLength(160);
    expect(result.discordHandle).toHaveLength(32);
  });

  it("drops invalid social handles", () => {
    const result = sanitizeProfileMetadata({
      twitterHandle: "@withSymbols",
      githubHandle: "bad..dots",
      discordHandle: "bad@chars!",
    });

    expect(result.twitterHandle).toBe("");
    expect(result.githubHandle).toBe("");
    expect(result.discordHandle).toBe("");
  });

  it("ignores unknown extra keys without throwing", () => {
    const result = sanitizeProfileMetadata({
      bio: "keep me",
      unknownKey: { nested: true },
      __proto__: { polluted: "field" },
    });

    expect(result.bio).toBe("keep me");
    expect(result).toEqual({
      ...PROFILE_METADATA_DEFAULTS,
      bio: "keep me",
    });
  });
});
