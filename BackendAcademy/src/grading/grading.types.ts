/**
 * Grading pipeline types (BE-037).
 *
 * The README's reward flow is the contract this module implements:
 *
 *   Learner completes task → AI Grader scores submission (off-chain)
 *   → Tutor confirms or overrides score → API calls reward_pool contract
 *
 * So a submission moves through a fixed set of statuses and every move is
 * appended to a per-submission transition log — the audit trail the issue asks
 * for. Overrides additionally carry the reviewing tutor's identity and reason,
 * so "who changed the AI's score, and why" survives the fact.
 */

/** Where a submission sits in the AI pre-score → tutor review pipeline. */
export type SubmissionStatus =
  | 'submitted'
  | 'ai_graded'
  | 'tutor_confirmed'
  | 'tutor_overridden';

/** Who caused a status transition. */
export type TransitionActorRole = 'learner' | 'ai' | 'tutor';

/** What the tutor did with the AI pre-score. */
export type TutorDecision = 'confirm' | 'override';

/**
 * Minimum final score that triggers rewards, on the same 0–100 scale the
 * reward_pool contract takes in its `submit_completion(score: u32)` call.
 */
export const GRADING_PASS_THRESHOLD = 60;

/**
 * One append-only entry in a submission's status history.
 *
 * `actorId` is the tutor id for review transitions and the learner id for the
 * initial submission, which is what makes an override attributable after the
 * fact; `actorRole` distinguishes a human decision from the AI pre-score.
 */
export interface SubmissionTransition {
  id: string;
  submissionId: string;
  /** `null` for the transition that creates the submission. */
  from: SubmissionStatus | null;
  to: SubmissionStatus;
  actorId: string;
  actorRole: TransitionActorRole;
  /** Required on overrides: why the tutor departed from the AI score. */
  reason?: string;
  /** Score in effect after this transition, when one is set. */
  score?: number;
  occurredAt: string;
}

/** Stage 1 output: the AI grader's score and feedback for a submission. */
export interface AiPreScore {
  /** 0–100, matching the reward_pool contract's score unit. */
  score: number;
  feedback: string;
  /** Tokens billed for the grading call, when the provider reports them. */
  tokensUsed?: number;
  gradedAt: string;
}

/** Stage 2 output: the tutor's confirmation or override of the AI pre-score. */
export interface TutorReview {
  /** The tutor who reviewed the submission — the override's identity record. */
  tutorId: string;
  decision: TutorDecision;
  /** The AI score at review time, kept so the override stays auditable. */
  aiScore: number;
  /** Score that goes on to trigger rewards. */
  finalScore: number;
  /** Required on `override`; omitted on `confirm`. */
  reason?: string;
  reviewedAt: string;
}

export interface Submission {
  submissionId: string;
  taskId: string;
  learnerId: string;
  content: string;
  status: SubmissionStatus;
  aiPreScore?: AiPreScore;
  tutorReview?: TutorReview;
  /** Set once a tutor has reviewed; this is the score rewards are based on. */
  finalScore?: number;
  /**
   * Reward event id, present only when `finalScore` met
   * `GRADING_PASS_THRESHOLD` and a reward was triggered.
   */
  rewardEventId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubmissionInput {
  taskId: string;
  learnerId: string;
  content: string;
}

export interface TutorReviewInput {
  tutorId: string;
  decision: TutorDecision;
  /** Required when `decision` is `override`. */
  score?: number;
  /** Required when `decision` is `override`. */
  reason?: string;
}
