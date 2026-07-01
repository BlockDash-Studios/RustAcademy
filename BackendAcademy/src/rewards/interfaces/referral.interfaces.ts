/**
 * Referral status options.
 *
 * - pending:   Referee registered but has not yet met the qualifying condition
 *              (e.g. completing their first task / course).
 * - qualified: Referee has met the qualifying condition; bonus is due.
 * - paid:      XLM bonus has been disbursed to the referrer's wallet.
 * - expired:   The referral window closed before the referee qualified.
 */
export type ReferralStatus = 'pending' | 'qualified' | 'paid' | 'expired';

/**
 * A single referral record — one referrer → one referee link.
 */
export interface ReferralRecord {
  /** Unique referral identifier */
  id: string;
  /** User ID of the person who invited the referee */
  referrerId: string;
  /** User ID of the person who was invited */
  refereeId: string;
  /** Current status of this referral */
  status: ReferralStatus;
  /** XLM bonus amount that will be (or has been) awarded to the referrer */
  bonusAmount: number;
  /** Currency of the bonus (always XLM in Phase 1) */
  currency: string;
  /** ISO 8601 timestamp when the referral was created */
  createdAt: string;
  /** ISO 8601 timestamp when the referee qualified (null if not yet qualified) */
  qualifiedAt: string | null;
  /** ISO 8601 timestamp when the bonus was paid out (null if not yet paid) */
  paidAt: string | null;
}

/**
 * Response shape for GET /rewards/referrals/:userId
 *
 * Returns summary stats plus a list of individual referral records
 * for the given referrer.
 */
export interface ReferralSummaryResponse {
  referrerId: string;
  /** Total number of referrals made by this user (all statuses) */
  totalReferrals: number;
  /** Number of referrals that have been paid out */
  paidReferrals: number;
  /** Total XLM earned through referral bonuses (paid only) */
  totalXlmEarned: number;
  /** Pending XLM that is due once referees qualify */
  pendingXlm: number;
  /** All referral records for this referrer */
  referrals: ReferralRecord[];
}

/**
 * Request body for POST /rewards/referrals
 *
 * Called when a new user registers via a referral link.
 */
export interface CreateReferralRequest {
  /** User ID of the referrer (the one who shared the link) */
  referrerId: string;
  /** User ID of the newly-registered referee */
  refereeId: string;
  /**
   * Optional: override the default bonus amount for this referral.
   * Useful for promotional campaigns. Falls back to REFERRAL_BONUS_XLM.
   */
  bonusAmount?: number;
}

/**
 * Request body for POST /rewards/referrals/:referralId/qualify
 *
 * Called by internal services when the referee completes the qualifying action
 * (e.g. first task submission graded ≥ 70, first course completed, etc.).
 */
export interface QualifyReferralRequest {
  /** Timestamp at which the qualifying event occurred */
  qualifiedAt?: string;
}

/**
 * Request body for POST /rewards/referrals/:referralId/pay
 *
 * Called by the payout service after the on-chain XLM transfer is confirmed.
 */
export interface PayReferralRequest {
  /** ISO 8601 timestamp of the confirmed payout */
  paidAt?: string;
}

/**
 * Lightweight response returned after a state-changing operation
 * (qualify / pay) to avoid re-fetching the full summary.
 */
export interface ReferralUpdateResponse {
  referralId: string;
  newStatus: ReferralStatus;
  bonusAmount: number;
  currency: string;
  /** Set when transitioning to 'qualified' */
  qualifiedAt: string | null;
  /** Set when transitioning to 'paid' */
  paidAt: string | null;
}
