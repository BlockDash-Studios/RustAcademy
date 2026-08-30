export type SubmissionState =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'GRADED'
  | 'REJECTED'
  | 'RESUBMITTED';

const TRANSITIONS: Record<SubmissionState, SubmissionState[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['IN_REVIEW'],
  IN_REVIEW: ['GRADED', 'REJECTED'],
  GRADED: [],
  REJECTED: ['RESUBMITTED'],
  RESUBMITTED: ['IN_REVIEW'],
};

export interface TransitionRecord {
  from: SubmissionState;
  to: SubmissionState;
  actorId: string;
  at: Date;
}

/** Validates and records a submission state transition. */
export function transitionSubmission(
  from: SubmissionState,
  to: SubmissionState,
  actorId: string,
): TransitionRecord {
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`Illegal submission transition: ${from} -> ${to}`);
  }
  return { from, to, actorId, at: new Date() };
}
