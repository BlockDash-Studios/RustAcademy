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
 * Protects routes that require a valid learner JWT.
 *
 * Expects an `authorization: Bearer <token>` Header.
 * The token payload must contain `role: "learner"` and a `sessionId`.
 * The associated session must not be expired, revoked, or idle.
 *
 * On success, attaches `request.user` with the decoded payload.
 */
@Injectable()
export class JwtLearnerGuard implements CanActivate {
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

    if (payload.role !== UserRole.LEARNER) {
      throw new ForbiddenException({
        error: 'LEARNER_ROLE_REQUIRED',
        message: 'Only learners are allowed to access this resource',
      });
    }

    // Enforce session expiration independently of JWT verification.
    const sessionId = (payload as JwtPayload & { sessionId?: string }).sessionId;
    if (!sessionId) {
      throw new UnauthorizedException({
        error: 'MISSING_SESSION',
        message: 'Token does not contain a session identifier',
      });
    }

    try {
      await this.authSessionService.validateSession(sessionId);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException({
        error: 'INVALID_SESSION',
        message: 'Session is expired, revoked, or inactive',
      });
    }

    // Attach decoded learner identity for downstream handlers
    (request as Request & { user: JwtPayload }).user = payload;
    return true;
  }

  private extractBearerToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}