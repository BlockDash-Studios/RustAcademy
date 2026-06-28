export type ChallengeVoteValue = 'up' | 'down';
export interface ChallengeVoteTally {
    challengeId: string;
    downvotes: number;
    score: number;
    totalVotes: number;
    upvotes: number;
}
export interface ChallengeVoteResponse extends ChallengeVoteTally {
    userId: string;
    userVote: ChallengeVoteValue;
}
