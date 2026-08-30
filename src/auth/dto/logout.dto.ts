import { IsOptional, IsString } from "class-validator";

export class LogoutDto {
  /**
   * Optional on purpose: a logout call with a missing/blank/already-used
   * refresh token is still a valid retry and must resolve the same way
   * as a call with a live token (see AuthSessionService#logout).
   */
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
