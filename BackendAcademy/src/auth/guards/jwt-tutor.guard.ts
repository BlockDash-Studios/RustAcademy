import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { UserRole } from '../enums/user-role.enum';
import { AuthSessionService } from '../auth-session.service';

/**
 * Protects routes that require a valid tutor JWT.
 *
 * Expects an `Authorization: Bearer <token>` Header.
 * The token payload must contain `role: "tutor"` and a `sessionId`.
 * The associated session must not be expired, revoked, or idle.
 *
 * On success, attaches `request.tutor` with the decoded payload.
 */
@Injectable()
export class JwtTutorGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException({
        error: 'MISSING_TOKEN',
        message: 'Authorization header with Bearer token is required',
      });
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException({
        error: 'INVALID_TOKEN',
        message: 'Token is invalid or has expired',
      });
    }

    if (payload.role !== UserRole.TUTOR) {
      throw new ForbiddenException({
        error: 'TUTOR_ROLE_REQUIRED',
        message: 'Only tutors are allowed to access this resource',
      });
    }

    // Enforce session expiration independently of JWT verification.
    // The JWT may be valid, but the session could be expired, revoked,
    // or idle beyond the allowed timeout. Session validation also
    // refreshes the last activity timestamp and removes/marks expired
    // sessions as required.
    if (!payload.sessionId) {
      throw new UnauthorizedException({
        error: 'MISSING_SESSION',
        message: 'Token does not contain a session identifier',
      });
    }

    try {
      await this.authSessionService.validateAndRefreshSession(payload.sessionId);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException({
        error: 'INVALID_SESSION',
        message: 'Session is expired, revoked, or inactive',
      });
    }

    // Attach decoded tutor identity for downstream handlers
    (request as Request & { tutor: JwtPayload }).tutor = payload;
    return true;
  }

  private extractBearerToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
