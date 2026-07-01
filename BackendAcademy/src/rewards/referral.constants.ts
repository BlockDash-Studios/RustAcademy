/**
 * Referral bonus configuration constants.
 *
 * All monetary values are expressed in whole XLM units.
 * Replace hard-coded values with environment-variable reads
 * (e.g. via ConfigService) when wiring up to production.
 */

/**
 * Default XLM bonus credited to the referrer when their referee
 * completes the qualifying action.
 */
export const REFERRAL_BONUS_XLM = 5;

/**
 * Currency symbol for referral payouts (Phase 1 is XLM-only).
 */
export const REFERRAL_CURRENCY = 'XLM';

/**
 * Number of days after which a pending referral is automatically
 * marked as 'expired' if the referee has not qualified.
 *
 * Set to 0 to disable automatic expiry (useful for testing).
 */
export const REFERRAL_EXPIRY_DAYS = 30;

/**
 * Maximum number of pending (unqualified) referrals a single user may
 * hold at any one time.  Prevents referral farming.
 *
 * Set to 0 to disable the cap.
 */
export const MAX_PENDING_REFERRALS_PER_USER = 50;

/**
 * Maximum total referrals (all statuses) tracked per referrer.
 * Older entries beyond this limit are not pruned automatically —
 * this constant is intended for display / pagination defaults.
 */
export const REFERRAL_DISPLAY_LIMIT = 100;
