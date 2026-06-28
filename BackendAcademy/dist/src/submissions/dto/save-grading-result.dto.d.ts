import { GradingResultStatus } from '../interfaces/grading-result-status.enum';
import { RubricEntry } from '../interfaces/grading-result.interface';
export declare class SaveGradingResultDto {
    graderId: string;
    status: GradingResultStatus;
    score: number;
    maxScore: number;
    feedback: string;
    privateNotes?: string;
    rubric?: RubricEntry[];
}
