export type Role = 'learner' | 'tutor' | 'admin';

export interface SubmissionAccessContext {
  submissionOwnerId: string;
  requesterId: string;
  requesterRole: Role;
}

/**
 * Returns true if the requester may access a submission's code/feedback.
 * Learners may only access their own submissions; tutors and admins
 * may access any submission.
 */
export function canAccessSubmission(ctx: SubmissionAccessContext): boolean {
  if (ctx.requesterRole === 'tutor' || ctx.requesterRole === 'admin') {
    return true;
  }
  return ctx.submissionOwnerId === ctx.requesterId;
}
