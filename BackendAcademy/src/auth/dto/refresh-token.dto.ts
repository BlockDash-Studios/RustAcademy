import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Request body for POST /auth/session/refresh.
 */
export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;

  /**
   * BA-016: device fingerprint presented at rotation. Required when
   * `SESSION_REQUIRE_DEVICE` is enabled; otherwise optional. Only the SHA-256
   * hash is ever compared or stored.
   */
  @IsOptional()
  @IsString()
  deviceFingerprint?: string;
}
