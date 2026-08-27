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

@Injectable()
export class JwtLearnerGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly sessionService: AuthSessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException({ error: 'MISSING_TOKEN', message: 'Authorization header with Bearer token is required' });
    }

    let payload: JwtPayload & { sessionId?: string };
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload & { sessionId?: string }>(token);
    } catch {
      throw new UnauthorizedException({ error: 'INVALID_TOKEN', message: 'Token is invalid or has expired' });
    }

    if (payload.role !== UserRole.LEARNER) {
      throw new ForbiddenException({ error: 'LEARNER_ROLE_REQUIRED', message: 'Only learners are allowed to access this resource' });
    }

    if (!payload.sessionId) {
      throw new UnauthorizedException({ error: 'MISSING_SESSION_ID', message: 'Token does not contain session id' });
    }

    // Enforce session expiration independently of JWT verification.
    await this.sessionService.validateSession(payload.sessionId);

    (request as Request & { user: JwtPayload }).user = payload;
    return true;
  }

  private extractBearerToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
