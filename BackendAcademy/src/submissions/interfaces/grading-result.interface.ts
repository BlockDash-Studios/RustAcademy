import { GradingResultStatus } from './grading-result-status.enum';

export interface IGradingResult {
  id: string;
  submissionId: string;
  graderId: string;
  status: GradingResultStatus;
  /** Numeric score, e.g. 0–100 */
  score: number;
  /** Maximum achievable score for this task */
  maxScore: number;
  /** Human-readable feedback visible to the student */
  feedback: string;
  /** Private notes only visible to instructors/graders */
  privateNotes?: string;
  /** Per-criterion breakdown: { criterion: string; points: number; maxPoints: number; comment?: string }[] */
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
