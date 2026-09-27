import { GRADING_PASS_THRESHOLD } from '../grading/grading.types';

/**
 * Certification eligibility types (BE-042).
 *
 * A learner qualifies for a `certificate_nft` mint when every task the course
 * requires has been graded and each of those scores meets the course's minimum
 * score. This module is the single eligibility oracle the certificate minting
 * job consults before it calls the Soroban `mint_certificate` entry point.
 *
 * The minimum score defaults to the grading pipeline's pass threshold so a
 * "passed" task is exactly one the rest of the academy already treats as
 * passing; a course may raise the bar per certificate.
 */

/** Course score below which a certificate is never minted. */
export const DEFAULT_CERTIFICATE_MIN_SCORE = GRADING_PASS_THRESHOLD;

/** What a course demands before a completion certificate may be minted. */
export interface CertificateCriteria {
  courseId: string;
  /** Every task id whose grade counts toward the certificate (unique). */
  taskIds: string[];
  /** Lowest per-task score that still counts as passing. */
  minScore: number;
}

/** The best final grading result recorded for one learner/task. */
export interface TaskResult {
  userId: string;
  courseId: string;
  taskId: string;
  score: number;
  /** True when `score` met the course's `minScore` at record time. */
  passed: boolean;
  recordedAt: string;
}

export interface RegisterCertificateCriteriaInput {
  courseId: string;
  taskIds: string[];
  /** Defaults to `DEFAULT_CERTIFICATE_MIN_SCORE`. */
  minScore?: number;
}

export interface RecordTaskResultInput {
  userId: string;
  courseId: string;
  taskId: string;
  /** 0–100, on the same scale as the grading pipeline and the NFT contract. */
  score: number;
}

/** The eligibility verdict handed to the certificate minting job. */
export interface CertificateEligibilityCheck {
  userId: string;
  courseId: string;
  eligible: boolean;
  status: 'eligible' | 'ineligible';
  minScore: number;
  tasksRequired: number;
  tasksPassed: number;
  /** Mean of the recorded task scores, rounded; `null` when nothing recorded. */
  averageScore: number | null;
  /**
   * Score to mint with, present only when eligible. This is `averageScore`, so
   * the on-chain certificate carries the learner's result, not just a pass flag.
   */
  finalScore: number | null;
  /** Effective (best) result per required task that has been graded. */
  tasks: TaskResult[];
  /** Human-readable explanations for an ineligible verdict; empty when eligible. */
  reasons: string[];
  checkedAt: string;
}
