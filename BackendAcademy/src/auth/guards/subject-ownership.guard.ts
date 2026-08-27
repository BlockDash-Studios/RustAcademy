import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { OWNERSHIP_KEY } from '../decorators/ownership.decorator';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { UserRole } from '../enums/user-role.enum';

/**
 * Guard that enforces subject ownership on a per-route basis.
 *
 * Run this guard AFTER a JWT guard has attached `req.user`, and declare the
 * route params that identify the target subject with `@Ownership(...)`.
 *
 * - Admins are allowed to operate across subjects.
 * - Non-admins must have `req.user.sub` equal to every declared param value,
 *   otherwise the request is rejected with 403 SUBJECT_MISMATCH.
 *
 * Usage:
 * @UseGuards(JwtAuthGuard, RolesGuard, SubjectOwnershipGuard)
 * @Roles(UserRole.LEARNER, UserRole.ADMIN)
 * @Ownership('userId')
 * async method() { ... }
 */
@Injectable()
export class SubjectOwnershipGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException({
        error: 'FORBIDDEN',
        message: 'Authentication is required before ownership can be verified',
      });
    }

    // Admins manage every subject.
    if (user.role === UserRole.ADMIN) {
      return true;
    }

    const ownedParams = this.reflector.getAllAndOverride<string[]>(
      OWNERSHIP_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!ownedParams || ownedParams.length === 0) {
      return true;
    }

    for (const param of ownedParams) {
      const claimedSubject = request.params?.[param];
      if (claimedSubject !== undefined && claimedSubject !== user.sub) {
        throw new ForbiddenException({
          error: 'SUBJECT_MISMATCH',
          message: 'You do not have access to another user\'s resource',
        });
      }
    }

    return true;
  }
}