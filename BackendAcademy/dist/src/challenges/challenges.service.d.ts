import { CastChallengeVoteDto } from './dto/cast-challenge-vote.dto';
import { ChallengeVoteResponse, ChallengeVoteTally } from './interfaces/challenge-vote.interface';
export declare class ChallengesService {
    private readonly votesByChallenge;
    castVote(challengeId: string, dto: CastChallengeVoteDto): ChallengeVoteResponse;
    getTally(challengeId: string): ChallengeVoteTally;
    resetVotes(): void;
    private normalizeId;
    private normalizeVote;
}
