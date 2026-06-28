import { GradingResultStatus } from '../interfaces/grading-result-status.enum';
import { IGradingResult, RubricEntry } from '../interfaces/grading-result.interface';
export declare class GradingResultEntity implements IGradingResult {
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
    constructor(partial: Partial<GradingResultEntity>);
    get percentage(): number;
    get passed(): boolean;
}
