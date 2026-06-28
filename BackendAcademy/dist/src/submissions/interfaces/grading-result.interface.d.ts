import { GradingResultStatus } from './grading-result-status.enum';
export interface IGradingResult {
    id: string;
    submissionId: string;
    graderId: string;
    status: GradingResultStatus;
    score: number;
    maxScore: number;
    feedback: string;
    privateNotes?: string;
    rubric?: RubricEntry[];
    gradedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}
export interface RubricEntry {
    criterion: string;
    points: number;
    maxPoints: number;
    comment?: string;
}
