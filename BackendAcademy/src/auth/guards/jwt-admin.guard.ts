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
 * Protects routes that require a valid admin JWT.
 *
 * Expects an `authorization: Bearer <token>` Header.
 * The token payload must contain role: "admin".
 *
 * On success, attaches request.user with the decoded payload.
 */
@Injectable()
export class JwtAdminGuard implements CanActivate {
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

    if (payload.role !== UserRole.ADMIN) {
      throw new ForbiddenException({
        error: 'ADMIN_ROLE_REQUIRED',
        message: 'Only admins are allowed to access this resource',
      });
    }

    // Enforce session expiration independently of JWT verification.
    // This ensures absolute expiry, delivery grace, and idle timeout
    // are applied even when the JWT itself is still valid.
    const sessionId =
      (payload as any).sessionId ?? (payload as any).jti ?? (payload as any).sid;
    if (!sessionId) {
      throw new UnauthorizedException({
        error: 'MISSING_SESSION',
        message: 'Token does not contain a valid session identifier',
      });
    }

    try {
      await this.authSessionService.validateSession(sessionId);
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException({
        error: 'SESSION_EXPIRED',
        message: 'Session has expired or is inactive',
      });
    }

    // Attach decoded user identity for downstream handlers
    (request as Request & { user: JwtPayload }).user = payload;
    return true;
  }

  private extractBearerToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}