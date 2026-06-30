import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Request body for POST /auth/session/refresh.
 */
export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
