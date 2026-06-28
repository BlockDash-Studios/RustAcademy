export type RiskLevel = 'low' | 'medium' | 'high';
export interface AntiCheatResult {
    flagged: boolean;
    confidence: number;
    riskLevel: RiskLevel;
    reason: string;
    recommendedAction: 'none' | 'warn_learner' | 'block_submission' | 'manual_review';
}
export interface AntiCheatProvider {
    analyzeSubmission(learnerId: string, taskId: string, content: string, metadata?: Record<string, unknown>): Promise<AntiCheatResult>;
}
