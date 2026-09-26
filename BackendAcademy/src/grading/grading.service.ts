import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CLAUDE_CLIENT, ClaudeClient } from '../ai/ai.module';
import { PromptGuardService } from '../ai/prompt-guard.service';
import { DomainEventBus } from '../gamification/domain-event-bus';
import {
  AiPreScore,
  CreateSubmissionInput,
  GRADING_PASS_THRESHOLD,
  Submission,
  SubmissionStatus,
  SubmissionTransition,
  TransitionActorRole,
  TutorReview,
  TutorReviewInput,
} from './grading.types';

/**
 * The prompt the AI grader is called with. The response is parsed as JSON, so
 * the shape is pinned here rather than left to the model's prose.
 */
const GRADER_SYSTEM_PROMPT =
  'You are the RustAcademy grading assistant. Grade the learner\'s Rust task submission on a 0-100 ' +
  'scale and explain the score. Respond with a single JSON object and nothing else: ' +
  '{"score": <integer between 0 and 100>, "feedback": "<concise, actionable feedback>"}.';

/**
 * Grading pipeline: AI pre-score → tutor review (BE-037).
 *
 * Stage 1 (`runAiPreScore`) sends an accepted submission to the Claude grader
 * via `CLAUDE_CLIENT` and stores the score + feedback. Stage 2 (`tutorReview`)
 * lets a tutor confirm that score or override it with their own score and a
 * reason. Only stage 2 sets `finalScore`, and a passing final score publishes a
 * `task.passed` domain event so the existing XP/reward pipeline fires — the
 * on-chain `reward_pool` call itself is downstream of that event.
 *
 * In-memory like `XpService` and `FollowService`, so it can be swapped for a
 * repository later without changing callers.
 *
 * Auditability: every status change goes through `recordTransition`, which only
 * ever appends. `getHistory` is the resulting trail, and review transitions
 * carry the tutor's id as `actorId` alongside the full `TutorReview` record, so
 * an override is attributable to a named tutor after the fact.
 */
@Injectable()
export class GradingService {
  private readonly submissions = new Map<string, Submission>();
  /** Append-only status history, keyed by submission id. */
  private readonly transitions = new Map<string, SubmissionTransition[]>();
  private nextSubmissionNumber = 1;
  private nextTransitionNumber = 1;

  constructor(
    @Inject(CLAUDE_CLIENT) private readonly claude: ClaudeClient,
    private readonly eventBus: DomainEventBus,
    private readonly promptGuard: PromptGuardService,
  ) {}

  /** Accepts a learner submission and opens its audit trail. */
  createSubmission(input: CreateSubmissionInput): Submission {
    const now = new Date().toISOString();
    const submission: Submission = {
      submissionId: `sub_${this.nextSubmissionNumber++}`,
      taskId: input.taskId,
      learnerId: input.learnerId,
      content: input.content,
      status: 'submitted',
      createdAt: now,
      updatedAt: now,
    };

    this.submissions.set(submission.submissionId, submission);
    this.recordTransition(submission, null, 'submitted', input.learnerId, 'learner');

    return submission;
  }

  /**
   * Stage 1: AI pre-score. Runs exactly once per submission, on a freshly
   * submitted one — re-grading after a tutor has reviewed would invalidate the
   * review, so the transition is refused instead.
   */
  async runAiPreScore(submissionId: string): Promise<Submission> {
    const submission = this.getOrThrow(submissionId);

    if (submission.status !== 'submitted') {
      throw new ConflictException({
        error: `Submission ${submissionId} is "${submission.status}" — AI pre-scoring only runs on a freshly submitted task.`,
        code: 'SUBMISSION_NOT_PENDING_AI',
      });
    }

    // The submission body is learner-supplied and goes into a prompt, so it is
    // checked before the grader ever sees it (BE-075).
    const guard = this.promptGuard.check(submission.learnerId, submission.content);
    if (!guard.allowed) {
      throw new BadRequestException({
        error: 'Submission content was rejected before being sent to the AI grader.',
        code: 'SUBMISSION_CONTENT_REJECTED',
        reason: guard.reason,
      });
    }

    const result = await this.claude.complete({
      role: 'grader',
      system: GRADER_SYSTEM_PROMPT,
      prompt: submission.content,
    });

    const { score, feedback } = this.parseGraderResponse(result.text);
    const aiPreScore: AiPreScore = {
      score,
      feedback,
      tokensUsed: result.tokensUsed,
      gradedAt: new Date().toISOString(),
    };

    submission.aiPreScore = aiPreScore;
    submission.status = 'ai_graded';
    submission.updatedAt = aiPreScore.gradedAt;
    this.recordTransition(submission, 'submitted', 'ai_graded', 'ai-grader', 'ai', { score });

    return submission;
  }

  /**
   * Stage 2: tutor confirms or overrides the AI pre-score. A confirm adopts the
   * AI score; an override must supply both a replacement score and a reason,
   * and records the tutor's identity on the review and on the transition.
   * Only this call sets `finalScore`, so only this call can trigger rewards.
   */
  tutorReview(submissionId: string, input: TutorReviewInput): Submission {
    const submission = this.getOrThrow(submissionId);

    if (!submission.aiPreScore || submission.status !== 'ai_graded') {
      throw new ConflictException({
        error: `Submission ${submissionId} has no AI pre-score awaiting tutor review.`,
        code: 'SUBMISSION_NOT_PENDING_REVIEW',
      });
    }

    const aiScore = submission.aiPreScore.score;
    let finalScore: number;
    let reason: string | undefined;

    if (input.decision === 'override') {
      if (input.score === undefined || !input.reason) {
        throw new BadRequestException({
          error: 'An override must include both the replacement score and a reason.',
          code: 'OVERRIDE_REQUIRES_SCORE_AND_REASON',
        });
      }
      finalScore = input.score;
      reason = input.reason;
    } else {
      finalScore = aiScore;
    }

    const reviewedAt = new Date().toISOString();
    const status: SubmissionStatus =
      input.decision === 'override' ? 'tutor_overridden' : 'tutor_confirmed';
    const review: TutorReview = {
      tutorId: input.tutorId,
      decision: input.decision,
      aiScore,
      finalScore,
      reason,
      reviewedAt,
    };

    submission.tutorReview = review;
    submission.finalScore = finalScore;
    submission.status = status;
    submission.updatedAt = reviewedAt;

    // The tutor's id is the transition actor, so the override is attributable.
    this.recordTransition(submission, 'ai_graded', status, input.tutorId, 'tutor', {
      score: finalScore,
      reason,
    });

    this.triggerRewardIfPassed(submission);

    return submission;
  }

  getSubmission(submissionId: string): Submission {
    return this.getOrThrow(submissionId);
  }

  /** The append-only status trail for a submission, oldest first. */
  getHistory(submissionId: string): SubmissionTransition[] {
    this.getOrThrow(submissionId);
    return (this.transitions.get(submissionId) ?? []).map((transition) => ({ ...transition }));
  }

  /** AI pre-scored submissions waiting on a tutor — the review dashboard queue. */
  getReviewQueue(): Submission[] {
    return [...this.submissions.values()].filter((submission) => submission.status === 'ai_graded');
  }

  /**
   * Final score triggers rewards: a passing score publishes a `task.passed`
   * event on the shared domain bus, which `XpService` turns into ledger points.
   * The event id is derived from the submission id, so a replay cannot double
   * award even though the in-memory pipeline is not transactional.
   */
  private triggerRewardIfPassed(submission: Submission): void {
    if (submission.finalScore === undefined || submission.finalScore < GRADING_PASS_THRESHOLD) {
      return;
    }

    const eventId = `grading:${submission.submissionId}`;
    submission.rewardEventId = eventId;
    this.eventBus.publish({
      eventId,
      userId: submission.learnerId,
      type: 'task.passed',
      occurredAt: submission.updatedAt,
      metadata: {
        submissionId: submission.submissionId,
        taskId: submission.taskId,
        score: submission.finalScore,
      },
    });
  }

  /** Appends one entry to the submission's history; nothing here ever mutates it. */
  private recordTransition(
    submission: Submission,
    from: SubmissionStatus | null,
    to: SubmissionStatus,
    actorId: string,
    actorRole: TransitionActorRole,
    details: { reason?: string; score?: number } = {},
  ): SubmissionTransition {
    const transition: SubmissionTransition = {
      id: `txn_${this.nextTransitionNumber++}`,
      submissionId: submission.submissionId,
      from,
      to,
      actorId,
      actorRole,
      reason: details.reason,
      score: details.score,
      occurredAt: new Date().toISOString(),
    };

    const history = this.transitions.get(submission.submissionId) ?? [];
    history.push(transition);
    this.transitions.set(submission.submissionId, history);

    return transition;
  }

  /** Parses the grader's `{"score", "feedback"}` JSON, rejecting anything else. */
  private parseGraderResponse(text: string): { score: number; feedback: string } {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw this.invalidGraderResponse();
    }

    let parsed: { score?: unknown; feedback?: unknown };
    try {
      parsed = JSON.parse(match[0]) as { score?: unknown; feedback?: unknown };
    } catch {
      throw this.invalidGraderResponse();
    }

    const { score, feedback } = parsed;
    if (
      typeof score !== 'number' ||
      !Number.isFinite(score) ||
      score < 0 ||
      score > 100 ||
      typeof feedback !== 'string' ||
      feedback.trim() === ''
    ) {
      throw this.invalidGraderResponse();
    }

    return { score: Math.round(score), feedback };
  }

  private invalidGraderResponse(): BadGatewayException {
    return new BadGatewayException({
      error: 'The AI grader did not return a valid score and feedback object.',
      code: 'AI_GRADER_RESPONSE_INVALID',
    });
  }

  private getOrThrow(submissionId: string): Submission {
    const submission = this.submissions.get(submissionId);
    if (!submission) {
      throw new NotFoundException({
        error: `No submission with id "${submissionId}".`,
        code: 'SUBMISSION_NOT_FOUND',
      });
    }
    return submission;
  }
}
