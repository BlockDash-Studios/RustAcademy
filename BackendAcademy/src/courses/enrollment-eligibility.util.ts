export type EligibilityCode =
  | 'OK'
  | 'ACCOUNT_INACTIVE'
  | 'COURSE_UNAVAILABLE'
  | 'PREREQUISITE_MISSING'
  | 'PAYMENT_REQUIRED';

export interface EligibilityInput {
  accountActive: boolean;
  courseAvailable: boolean;
  prerequisitesMet: boolean;
  paymentSatisfied: boolean;
}

/** Evaluates enrollment eligibility, returning the first failing stable code. */
export function checkEnrollmentEligibility(input: EligibilityInput): EligibilityCode {
  if (!input.accountActive) return 'ACCOUNT_INACTIVE';
  if (!input.courseAvailable) return 'COURSE_UNAVAILABLE';
  if (!input.prerequisitesMet) return 'PREREQUISITE_MISSING';
  if (!input.paymentSatisfied) return 'PAYMENT_REQUIRED';
  return 'OK';
}
