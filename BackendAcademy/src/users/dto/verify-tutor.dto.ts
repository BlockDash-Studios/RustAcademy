import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body used by an admin to verify a tutor.
 * `adminId` should be supplied by an authenticated admin/role guard in the
 * REST layer in production; it is optional here for offline/test usage.
 */
export class VerifyTutorDto {
  @IsOptional()
  @IsString()
  adminId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
