import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body used by a tutor to apply for verification (moves status to PENDING).
 */
export class RequestVerificationDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
