import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Challenge,
  ChallengePayout,
  ChallengeState,
  ChallengeSubmission,
} from './social.types';

/** The only transitions the lifecycle permits (BE-091). */
const ALLOWED_TRANSITIONS: Record<ChallengeState, ChallengeState[]> = {
  open: ['voting'],
  voting: ['closed'],
  closed: [],
};

@Injectable()
export class ChallengeService {
  private readonly challenges = new Map<string, Challenge>();
  private readonly submissions = new Map<string, ChallengeSubmission[]>();
  /** voterId per challenge, so one account votes once. */
  private readonly votes = new Map<string, Map<string, string>>();
  /** Payout requests awaiting the BE-053 job. */
  private readonly payoutQueue: ChallengePayout[] = [];

  create(input: { challengeId: string; title: string; potStroops: bigint }): Challenge {
    if (this.challenges.has(input.challengeId)) {
      throw new BadRequestException(`Challenge ${input.challengeId} already exists`);
    }
    if (input.potStroops < 0n) {
      throw new BadRequestException('potStroops cannot be negative');
    }

    const challenge: Challenge = {
      challengeId: input.challengeId,
      title: input.title,
      potStroops: input.potStroops,
      state: 'open',
      createdAt: new Date().toISOString(),
    };
    this.challenges.set(challenge.challengeId, challenge);
    return challenge;
  }

  get(challengeId: string): Challenge {
    const challenge = this.challenges.get(challengeId);
    if (!challenge) throw new NotFoundException(`Unknown challenge ${challengeId}`);
    return challenge;
  }

  /** Entries arrive from the task pipeline; accepted only while `open`. */
  submit(challengeId: string, input: { userId: string; submissionId: string }): ChallengeSubmission {
    this.assertState(challengeId, 'open', 'accept submissions');

    const existing = this.submissions.get(challengeId) ?? [];
    if (existing.some((s) => s.submissionId === input.submissionId)) {
      throw new BadRequestException(`Submission ${input.submissionId} already entered`);
    }

    const submission: ChallengeSubmission = {
      ...input,
      challengeId,
      submittedAt: new Date().toISOString(),
    };
    existing.push(submission);
    this.submissions.set(challengeId, existing);
    return submission;
  }

  getSubmissions(challengeId: string): ChallengeSubmission[] {
    return [...(this.submissions.get(challengeId) ?? [])];
  }

  /** `open` → `voting`. */
  openVoting(challengeId: string): Challenge {
    return this.transition(challengeId, 'voting');
  }

  /**
   * One vote per account, only during the voting window.
   *
   * Self-voting is rejected: the pot is community-decided, so letting an author
   * vote for their own entry is the cheapest way to game it.
   */
  vote(challengeId: string, input: { voterId: string; submissionId: string }): void {
    this.assertState(challengeId, 'voting', 'accept votes');

    const entries = this.getSubmissions(challengeId);
    const target = entries.find((s) => s.submissionId === input.submissionId);
    if (!target) {
      throw new BadRequestException(`Unknown submission ${input.submissionId}`);
    }
    if (target.userId === input.voterId) {
      throw new BadRequestException('An entrant cannot vote for their own submission');
    }

    const cast = this.votes.get(challengeId) ?? new Map<string, string>();
    if (cast.has(input.voterId)) {
      throw new BadRequestException(`${input.voterId} has already voted`);
    }
    cast.set(input.voterId, input.submissionId);
    this.votes.set(challengeId, cast);
  }

  getTally(challengeId: string): Record<string, number> {
    const tally: Record<string, number> = {};
    for (const submissionId of (this.votes.get(challengeId) ?? new Map()).values()) {
      tally[submissionId] = (tally[submissionId] ?? 0) + 1;
    }
    return tally;
  }

  /**
   * `voting` → `closed`, then queues the payout for the BE-053 job.
   *
   * Winners are every submission tied on the top vote count. This service does
   * not move funds: BE-053 owns payment, so closing only enqueues a request that
   * job drains. Keeping the boundary here means a payment failure cannot leave
   * the challenge stuck mid-transition.
   */
  close(challengeId: string): { challenge: Challenge; payout: ChallengePayout } {
    const challenge = this.transition(challengeId, 'closed');
    const tally = this.getTally(challengeId);

    let winners: string[] = [];
    let best = 0;
    for (const [submissionId, count] of Object.entries(tally)) {
      if (count > best) {
        best = count;
        winners = [submissionId];
      } else if (count === best && count > 0) {
        winners.push(submissionId);
      }
    }
    winners.sort();

    const payout: ChallengePayout = {
      challengeId,
      winningSubmissionIds: winners,
      awards: this.splitPot(challenge.potStroops, winners),
      votes: best,
      queuedAt: new Date().toISOString(),
    };
    this.payoutQueue.push(payout);
    return { challenge, payout };
  }

  /** Requests awaiting BE-053. Draining is that job's responsibility. */
  getPendingPayouts(): ChallengePayout[] {
    return [...this.payoutQueue];
  }

  /**
   * Splits the pot in stroops, the indivisible unit, so no fraction is invented.
   *
   * Integer division leaves a remainder of at most `winners - 1` stroops; it goes
   * to the first winner in sorted order rather than being dropped, so the awards
   * always sum to exactly the pot.
   */
  private splitPot(potStroops: bigint, winners: string[]): Record<string, bigint> {
    const awards: Record<string, bigint> = {};
    if (winners.length === 0) return awards;

    const count = BigInt(winners.length);
    const share = potStroops / count;
    const remainder = potStroops % count;

    winners.forEach((submissionId, index) => {
      awards[submissionId] = index === 0 ? share + remainder : share;
    });

    return awards;
  }

  private assertState(challengeId: string, required: ChallengeState, action: string): void {
    const challenge = this.get(challengeId);
    if (challenge.state !== required) {
      throw new BadRequestException(
        `Challenge ${challengeId} is ${challenge.state}; it must be ${required} to ${action}`,
      );
    }
  }

  private transition(challengeId: string, next: ChallengeState): Challenge {
    const challenge = this.get(challengeId);

    if (!ALLOWED_TRANSITIONS[challenge.state].includes(next)) {
      throw new BadRequestException(
        `Cannot move challenge ${challengeId} from ${challenge.state} to ${next}`,
      );
    }

    challenge.state = next;
    return challenge;
  }
}
