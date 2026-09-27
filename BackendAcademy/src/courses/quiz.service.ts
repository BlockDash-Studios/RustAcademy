import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  GradedAnswer,
  Quiz,
  QuizAttempt,
  QuizQuestion,
  SubmittedAnswer,
} from './quiz.types';

function normalize(value: string, caseSensitive?: boolean): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return caseSensitive ? trimmed : trimmed.toLowerCase();
}

function gradeQuestion(question: QuizQuestion, submitted?: SubmittedAnswer): GradedAnswer {
  const pointsPossible = question.points ?? 1;
  let correct = false;

  if (question.type === 'multiple_choice') {
    correct = !!submitted?.optionId && submitted.optionId === question.correctOptionId;
  } else {
    const answerText = submitted?.text ?? '';
    const normalizedAnswer = normalize(answerText, question.caseSensitive);
    correct = question.acceptedAnswers.some(
      (accepted) => normalize(accepted, question.caseSensitive) === normalizedAnswer,
    );
  }

  return {
    questionId: question.id,
    correct,
    pointsAwarded: correct ? pointsPossible : 0,
    pointsPossible,
  };
}

@Injectable()
export class QuizService {
  private readonly quizzes = new Map<string, Quiz>();
  // key: `${quizId}:${userId}` -> attempts, ordered oldest first
  private readonly attempts = new Map<string, QuizAttempt[]>();

  private attemptsKey(quizId: string, userId: string): string {
    return `${quizId}:${userId}`;
  }

  createQuiz(quiz: Quiz): Quiz {
    for (const question of quiz.questions) {
      if (question.type === 'multiple_choice') {
        if (!question.options?.length || !question.correctOptionId) {
          throw new ForbiddenException(
            `Question ${question.id} must define options and correctOptionId`,
          );
        }
        const validOption = question.options.some((option) => option.id === question.correctOptionId);
        if (!validOption) {
          throw new ForbiddenException(
            `Question ${question.id} correctOptionId does not match any option`,
          );
        }
      } else if (question.type === 'fill_in_blank') {
        if (!question.acceptedAnswers?.length) {
          throw new ForbiddenException(`Question ${question.id} must define acceptedAnswers`);
        }
      }
    }

    this.quizzes.set(quiz.id, quiz);
    return quiz;
  }

  getQuiz(quizId: string): Quiz {
    const quiz = this.quizzes.get(quizId);
    if (!quiz) {
      throw new NotFoundException(`Quiz ${quizId} not found`);
    }
    return quiz;
  }

  getAttempts(quizId: string, userId: string): QuizAttempt[] {
    return [...(this.attempts.get(this.attemptsKey(quizId, userId)) ?? [])];
  }

  getBestScore(quizId: string, userId: string): QuizAttempt | null {
    const attempts = this.getAttempts(quizId, userId);
    if (attempts.length === 0) {
      return null;
    }
    return attempts.reduce((best, attempt) =>
      attempt.percentage > best.percentage ? attempt : best,
    );
  }

  /** Auto-grades instantly against the answer key and persists the attempt. */
  submitAttempt(quizId: string, userId: string, submittedAnswers: SubmittedAnswer[]): {
    attempt: QuizAttempt;
    attemptsUsed: number;
    attemptsRemaining: number | null;
    bestScore: QuizAttempt;
  } {
    const quiz = this.getQuiz(quizId);
    const key = this.attemptsKey(quizId, userId);
    const existingAttempts = this.attempts.get(key) ?? [];

    if (quiz.maxAttempts && existingAttempts.length >= quiz.maxAttempts) {
      throw new ForbiddenException(
        `Attempt limit reached: ${quiz.maxAttempts} attempt(s) allowed for this quiz`,
      );
    }

    const answersByQuestionId = new Map(submittedAnswers.map((answer) => [answer.questionId, answer]));

    const graded = quiz.questions.map((question) =>
      gradeQuestion(question, answersByQuestionId.get(question.id)),
    );

    const score = graded.reduce((sum, g) => sum + g.pointsAwarded, 0);
    const maxScore = graded.reduce((sum, g) => sum + g.pointsPossible, 0);
    const percentage = maxScore > 0 ? Math.round((score / maxScore) * 10000) / 100 : 0;

    const attempt: QuizAttempt = {
      id: randomUUID(),
      quizId,
      userId,
      attemptNumber: existingAttempts.length + 1,
      answers: graded,
      score,
      maxScore,
      percentage,
      submittedAt: new Date().toISOString(),
    };

    const updatedAttempts = [...existingAttempts, attempt];
    this.attempts.set(key, updatedAttempts);

    const bestScore = this.getBestScore(quizId, userId)!;
    const attemptsRemaining = quiz.maxAttempts ? quiz.maxAttempts - updatedAttempts.length : null;

    return { attempt, attemptsUsed: updatedAttempts.length, attemptsRemaining, bestScore };
  }
}
