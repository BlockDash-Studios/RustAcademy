export class CheckSubmissionDto {
  /** ID of the learner who made the submission */
  learnerId: string;

  /** ID of the task being evaluated */
  taskId: string;

  /** The code or answer content submitted by the learner */
  content: string;

  /**
   * Optional metadata that can improve detection accuracy,
   * e.g. time taken, keystroke cadence, mouse events.
   */
  metadata?: Record<string, unknown>;
}
