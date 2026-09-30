import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class AccrueEscrowDto {
  @IsString()
  @IsNotEmpty()
  tutorId: string;

  /** Client-supplied idempotency key; becomes the escrow entry id. */
  @IsString()
  @IsNotEmpty()
  accrualId: string;

  /** Amount in stroops (1 XLM = 10^7 stroops). Integer because a stroop is indivisible. */
  @IsInt()
  @Min(1)
  amountStroops: number;
}

export class WithdrawEscrowDto {
  @IsString()
  @IsNotEmpty()
  tutorId: string;
}

export class ReleaseUnlockedDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  now?: string;
}
