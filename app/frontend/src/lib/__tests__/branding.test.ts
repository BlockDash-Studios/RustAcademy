import { BRANDING, getBrandedTitle } from "../branding";

describe("branding config", () => {
  it("has all required fields", () => {
    expect(BRANDING.productName).toBe("RustAcademy");
    expect(BRANDING.companyName).toBe("RustAcademy");
    expect(BRANDING.tagline).toBe("Learn Rust, earn XLM, build Web3");
    expect(BRANDING.description).toBe("Privacy-focused payments on Stellar");
    expect(BRANDING.twitterHandle).toBe("RustAcademy");
    expect(Array.isArray(BRANDING.keywords)).toBe(true);
    expect(BRANDING.keywords.length).toBeGreaterThan(0);
    expect(BRANDING.defaultSiteUrl).toBe("https://RustAcademy.to");
    expect(BRANDING.ogImageAlt).toContain("RustAcademy");
  });

  it("getBrandedTitle returns product name when no page title", () => {
    expect(getBrandedTitle()).toBe("RustAcademy");
  });

  it("getBrandedTitle formats page title correctly", () => {
    expect(getBrandedTitle("Dashboard")).toBe("Dashboard | RustAcademy");
    expect(getBrandedTitle("Settings")).toBe("Settings | RustAcademy");
  });

  it("branding values are not empty strings", () => {
    expect(BRANDING.productName).not.toBe("");
    expect(BRANDING.companyName).not.toBe("");
    expect(BRANDING.tagline).not.toBe("");
    expect(BRANDING.description).not.toBe("");
    expect(BRANDING.twitterHandle).not.toBe("");
    expect(BRANDING.defaultSiteUrl).not.toBe("");
    expect(BRANDING.ogImageAlt).not.toBe("");
  });
});
