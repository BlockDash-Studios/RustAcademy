import { IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '../enums/user-role.enum';

/**
 * Request body for POST /auth/session/login.
 *
 * In production this would validate credentials against a user store.
 * Here we accept a userId + role pair so the service can be wired in
 * without a full database dependency.
 */
export class LoginDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  /**
   * BA-016: client-generated device fingerprint. Optional at the API layer;
   * whether it is required to log in is controlled by the session policy
   * (`SESSION_REQUIRE_DEVICE`). Passed to {@link AuthSessionService.createSession}
   * unmodified only for hashing; the raw value is never stored or logged.
   */
  @IsOptional()
  @IsString()
  deviceFingerprint?: string;
}
