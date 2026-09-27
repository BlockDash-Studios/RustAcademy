/**
 * Centralized branding configuration for the application.
 * All brand strings and metadata should be sourced from this file.
 * This ensures consistency and makes localization/auditing easier.
 */

export interface BrandingConfig {
  /** The main product name */
  productName: string;
  /** The company/organization name */
  companyName: string;
  /** Short tagline/description */
  tagline: string;
  /** Full description for SEO/metadata */
  description: string;
  /** Twitter handle (without @) */
  twitterHandle: string;
  /** Keywords for SEO */
  keywords: string[];
  /** Default site URL */
  defaultSiteUrl: string;
  /** Default OG image alt text */
  ogImageAlt: string;
}

export const BRANDING: BrandingConfig = {
  productName: "RustAcademy",
  companyName: "RustAcademy",
  tagline: "Learn Rust, earn XLM, build Web3",
  description: "Privacy-focused payments on Stellar",
  twitterHandle: "RustAcademy",
  keywords: ["Stellar", "payments", "crypto", "XLM", "USDC", "payment link", "Rust", "Web3"],
  defaultSiteUrl: "https://RustAcademy.to",
  ogImageAlt: "RustAcademy — Privacy-focused payments on Stellar",
};

/**
 * Get a branded title with optional page-specific suffix.
 */
export function getBrandedTitle(pageTitle?: string): string {
  if (pageTitle) {
    return `${pageTitle} | ${BRANDING.productName}`;
  }
  return BRANDING.productName;
}
