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
 * Protects routes that require a valid learner JWT.
 *
 * Expects an `Authorization: Bearer <token>` header.
 * The token payload must contain `role: "learner"`.
 *
 * On success, attaches `request.user` with the decoded payload.
 */
@Injectable()
export class JwtLearnerGuard extends JwtAuthGuard {
  constructor(jwtService: JwtService) {
    super(jwtService);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: JwtPayload }>();

    if (request.user.role !== UserRole.LEARNER) {
      throw new ForbiddenException({
        error: 'LEARNER_ROLE_REQUIRED',
        message: 'Only learners are allowed to access this resource',
      });
    }

    return true;
  }
}