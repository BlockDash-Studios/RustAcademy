export type QuestionType = 'multiple_choice' | 'fill_in_blank';

export interface McqOption {
  id: string;
  text: string;
}

export interface MultipleChoiceQuestion {
  id: string;
  type: 'multiple_choice';
  prompt: string;
  points: number;
  options: McqOption[];
  correctOptionId: string;
}

export interface FillInBlankQuestion {
  id: string;
  type: 'fill_in_blank';
  prompt: string;
  points: number;
  /** Any of these count as correct once normalized. */
  acceptedAnswers: string[];
  caseSensitive?: boolean;
}

export type QuizQuestion = MultipleChoiceQuestion | FillInBlankQuestion;

export interface Quiz {
  id: string;
  lessonId: string;
  title: string;
  /** Max submitted attempts allowed. Undefined/0 means unlimited. */
  maxAttempts?: number;
  questions: QuizQuestion[];
}

export interface SubmittedAnswer {
  questionId: string;
  /** Present for multiple_choice answers. */
  optionId?: string;
  /** Present for fill_in_blank answers. */
  text?: string;
}

export interface GradedAnswer {
  questionId: string;
  correct: boolean;
  pointsAwarded: number;
  pointsPossible: number;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  userId: string;
  attemptNumber: number;
  answers: GradedAnswer[];
  score: number;
  maxScore: number;
  percentage: number;
  submittedAt: string;
}
