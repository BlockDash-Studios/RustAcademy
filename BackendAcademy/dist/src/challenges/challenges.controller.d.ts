import { ChallengesService } from './challenges.service';
import { CastChallengeVoteDto } from './dto/cast-challenge-vote.dto';
import { ChallengeVoteResponse, ChallengeVoteTally } from './interfaces/challenge-vote.interface';
export declare class ChallengesController {
    private readonly challengesService;
    constructor(challengesService: ChallengesService);
    castVote(challengeId: string, dto: CastChallengeVoteDto): ChallengeVoteResponse;
    getTally(challengeId: string): ChallengeVoteTally;
}
