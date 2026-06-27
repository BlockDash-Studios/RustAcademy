export type RiskLevel = 'low' | 'medium' | 'high';

export interface AntiCheatResult {
  /** Whether the submission is flagged as potentially dishonest */
  flagged: boolean;

  /** Confidence score from the AI model, 0.0 – 1.0 */
  confidence: number;

  /** Categorical risk assessment */
  riskLevel: RiskLevel;

  /** Human-readable reason for the decision */
  reason: string;

  /**
   * Suggested action for the platform to take.
   * e.g. 'none' | 'warn_learner' | 'block_submission' | 'manual_review'
   */
  recommendedAction: 'none' | 'warn_learner' | 'block_submission' | 'manual_review';
}

export interface AntiCheatProvider {
  /** Run the AI-based check against a submission */
  analyzeSubmission(
    learnerId: string,
    taskId: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<AntiCheatResult>;
}
