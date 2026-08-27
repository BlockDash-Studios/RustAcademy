import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Generic authentication guard.
 *
 * Verifies the `Authorization: Bearer <token>` header and attaches the
 * decoded `JwtPayload` to `request.user` for downstream role guards and
 * handlers. Role enforcement is the responsibility of `JwtAdminGuard`,
 * `JwtTutorGuard`, `JwtLearnerGuard`, or `RolesGuard`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(protected readonly jwtService: JwtService) {}

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

    // A valid signature alone is not enough — a subject must be present.
    if (!payload || !payload.sub) {
      throw new UnauthorizedException({
        error: 'INVALID_TOKEN',
        message: 'Token is invalid or has expired',
      });
    }

    this.attachUser(request, payload);
    return true;
  }

  /**
   * Attaches the decoded identity to `request.user`. Standardizes the
   * subject property across every role guard so ownership guards and
   * handlers can always read `request.user`.
   */
  protected attachUser(request: Request, payload: JwtPayload): void {
    (request as Request & { user: JwtPayload }).user = payload;
  }

  protected extractBearerToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}