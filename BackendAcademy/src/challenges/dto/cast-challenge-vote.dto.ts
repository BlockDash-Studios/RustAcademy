import { IsString, IsIn } from 'class-validator';

export class CastChallengeVoteDto {
  @IsString()
  userId: string;

  @IsIn(['up', 'down'])
  value: 'up' | 'down';
}
