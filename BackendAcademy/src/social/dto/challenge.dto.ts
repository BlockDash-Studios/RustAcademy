import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

export class CreateChallengeDto {
  @IsString()
  @IsNotEmpty()
  challengeId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(140)
  title: string;

  /** Bonus pot in stroops. Integer because a stroop is indivisible. */
  @IsInt()
  @Min(0)
  potStroops: number;
}

export class SubmitChallengeDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  submissionId: string;
}

export class VoteDto {
  @IsString()
  @IsNotEmpty()
  voterId: string;

  @IsString()
  @IsNotEmpty()
  submissionId: string;
}
