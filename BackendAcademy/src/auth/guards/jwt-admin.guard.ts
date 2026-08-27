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
 * Protects routes that require a valid admin JWT.
 *
 * Expects an `Authorization: Bearer <token>` header.
 * The token payload must contain `role: "admin"`.
 *
 * On success, attaches `request.user` with the decoded payload.
 */
@Injectable()
export class JwtAdminGuard extends JwtAuthGuard {
  constructor(jwtService: JwtService) {
    super(jwtService);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: JwtPayload }>();

    if (request.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException({
        error: 'ADMIN_ROLE_REQUIRED',
        message: 'Only admins are allowed to access this resource',
      });
    }

    return true;
  }
}