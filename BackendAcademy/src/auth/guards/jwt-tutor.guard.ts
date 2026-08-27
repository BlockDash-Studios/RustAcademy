import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { UserRole } from '../enums/user-role.enum';

/**
 * Protects routes that require a valid tutor JWT.
 *
 * Expects an `Authorization: Bearer <token>` header.
 * The token payload must contain `role: "tutor"`.
 *
 * On success, attaches `request.user` (and the deprecated `request.tutor`
 * alias) with the decoded payload.
 */
@Injectable()
export class JwtTutorGuard extends JwtAuthGuard {
  constructor(jwtService: JwtService) {
    super(jwtService);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: JwtPayload }>();

    if (request.user.role !== UserRole.TUTOR) {
      throw new ForbiddenException({
        error: 'TUTOR_ROLE_REQUIRED',
        message: 'Only tutors are allowed to access this resource',
      });
    }

    // Backward-compatibility alias for handlers that read `request.tutor`.
    (request as Request & { user: JwtPayload; tutor?: JwtPayload }).tutor =
      request.user;
    return true;
  }
}