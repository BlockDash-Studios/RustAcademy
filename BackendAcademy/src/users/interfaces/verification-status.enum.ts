/**
 * Verification lifecycle for tutor accounts.
 *
 * - UNVERIFIED: Default state. Tutor has not requested verification.
 * - PENDING:    Tutor has requested verification; awaiting admin review.
 * - VERIFIED:   Admin has approved the tutor (eligible for premium features).
 * - REJECTED:   Admin reviewed and denied the application.
 */
export enum VerificationStatus {
  UNVERIFIED = 'unverified',
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}
