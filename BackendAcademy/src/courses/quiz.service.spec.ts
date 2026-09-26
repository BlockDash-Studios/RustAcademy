import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { QuizService } from './quiz.service';
import { Quiz } from './quiz.types';

function buildQuiz(overrides: Partial<Quiz> = {}): Quiz {
  return {
    id: 'quiz-1',
    lessonId: 'lesson-1',
    title: 'Ownership Basics',
    maxAttempts: 2,
    questions: [
      {
        id: 'q1',
        type: 'multiple_choice',
        prompt: 'Which keyword transfers ownership by default?',
        points: 1,
        options: [
          { id: 'a', text: 'move' },
          { id: 'b', text: 'copy' },
          { id: 'c', text: 'clone' },
        ],
        correctOptionId: 'a',
      },
      {
        id: 'q2',
        type: 'fill_in_blank',
        prompt: 'The trait that allows implicit copying is ____.',
        points: 1,
        acceptedAnswers: ['Copy'],
      },
    ],
    ...overrides,
  };
}

describe('QuizService', () => {
  let service: QuizService;

  beforeEach(() => {
    service = new QuizService();
    service.createQuiz(buildQuiz());
  });

  it('auto-grades a fully correct attempt instantly', () => {
    const result = service.submitAttempt('quiz-1', 'user-1', [
      { questionId: 'q1', optionId: 'a' },
      { questionId: 'q2', text: 'Copy' },
    ]);

    expect(result.attempt.score).toBe(2);
    expect(result.attempt.maxScore).toBe(2);
    expect(result.attempt.percentage).toBe(100);
    expect(result.attempt.answers.every((a) => a.correct)).toBe(true);
    expect(result.attemptsUsed).toBe(1);
  });

  it('grades fill-in-the-blank case-insensitively and trims whitespace', () => {
    const result = service.submitAttempt('quiz-1', 'user-1', [
      { questionId: 'q1', optionId: 'b' },
      { questionId: 'q2', text: '  copy  ' },
    ]);

    const q1 = result.attempt.answers.find((a) => a.questionId === 'q1')!;
    const q2 = result.attempt.answers.find((a) => a.questionId === 'q2')!;
    expect(q1.correct).toBe(false);
    expect(q2.correct).toBe(true);
    expect(result.attempt.score).toBe(1);
    expect(result.attempt.percentage).toBe(50);
  });

  it('treats a missing/blank answer as incorrect rather than throwing', () => {
    const result = service.submitAttempt('quiz-1', 'user-1', [{ questionId: 'q1', optionId: 'a' }]);

    const q2 = result.attempt.answers.find((a) => a.questionId === 'q2')!;
    expect(q2.correct).toBe(false);
    expect(result.attempt.score).toBe(1);
  });

  it('stores attempts and tracks the best score across multiple attempts', () => {
    service.submitAttempt('quiz-1', 'user-1', [{ questionId: 'q1', optionId: 'b' }]); // 0/2
    const second = service.submitAttempt('quiz-1', 'user-1', [
      { questionId: 'q1', optionId: 'a' },
      { questionId: 'q2', text: 'Copy' },
    ]); // 2/2

    const attempts = service.getAttempts('quiz-1', 'user-1');
    expect(attempts).toHaveLength(2);
    expect(attempts[0].attemptNumber).toBe(1);
    expect(attempts[1].attemptNumber).toBe(2);

    const best = service.getBestScore('quiz-1', 'user-1');
    expect(best?.percentage).toBe(100);
    expect(second.bestScore.percentage).toBe(100);
  });

  it('enforces the attempt limit and rejects further submissions', () => {
    service.submitAttempt('quiz-1', 'user-1', []);
    service.submitAttempt('quiz-1', 'user-1', []);

    expect(() => service.submitAttempt('quiz-1', 'user-1', [])).toThrow(ForbiddenException);
  });

  it('reports remaining attempts, null when unlimited', () => {
    const limited = service.submitAttempt('quiz-1', 'user-1', []);
    expect(limited.attemptsRemaining).toBe(1);

    service.createQuiz(buildQuiz({ id: 'quiz-unlimited', maxAttempts: undefined }));
    const unlimited = service.submitAttempt('quiz-unlimited', 'user-1', []);
    expect(unlimited.attemptsRemaining).toBeNull();
  });

  it('keeps attempt limits and attempts independent per user', () => {
    service.submitAttempt('quiz-1', 'user-1', []);
    service.submitAttempt('quiz-1', 'user-1', []);

    // A different user on the same quiz is unaffected by user-1's limit.
    const result = service.submitAttempt('quiz-1', 'user-2', [{ questionId: 'q1', optionId: 'a' }]);
    expect(result.attemptsUsed).toBe(1);
    expect(service.getAttempts('quiz-1', 'user-1')).toHaveLength(2);
  });

  it('throws NotFoundException for an unknown quiz', () => {
    expect(() => service.getQuiz('missing')).toThrow(NotFoundException);
    expect(() => service.submitAttempt('missing', 'user-1', [])).toThrow(NotFoundException);
  });

  it('rejects quiz creation when a multiple_choice question has no matching correctOptionId', () => {
    expect(() =>
      service.createQuiz(
        buildQuiz({
          id: 'bad-quiz',
          questions: [
            {
              id: 'q1',
              type: 'multiple_choice',
              prompt: 'bad',
              points: 1,
              options: [{ id: 'a', text: 'x' }],
              correctOptionId: 'z',
            },
          ],
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
