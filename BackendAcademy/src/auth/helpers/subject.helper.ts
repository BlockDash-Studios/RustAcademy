import { ForbiddenException } from '@nestjs/common';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { UserRole } from '../enums/user-role.enum';

/**
 * Verifies that an authenticated user owns a resource whose subject id is
 * resolved separately (e.g. from a loaded entity).
 *
 * Admins are allowed to operate across subjects; everyone else must match
 * the JWT subject exactly. Throws 403 SUBJECT_MISMATCH otherwise.
 */
export function assertSameSubject(
  user: JwtPayload | undefined,
  ownerId: string | null | undefined,
  resource = 'resource',
): void {
  if (!user) {
    throw new ForbiddenException({
      error: 'FORBIDDEN',
      message: 'Authentication is required before ownership can be verified',
    });
  }

  if (user.role === UserRole.ADMIN) {
    return;
  }

  if (!ownerId || ownerId !== user.sub) {
    throw new ForbiddenException({
      error: 'SUBJECT_MISMATCH',
      message: `You do not have access to this ${resource}`,
    });
  }
}

/**
 * Allowed for the owning user unless the caller holds one of `staffRoles`
 * (e.g. tutor or admin). Non-staff callers must own the resource.
 */
export function assertOwnerOrStaff(
  user: JwtPayload | undefined,
  ownerId: string | null | undefined,
  staffRoles: UserRole[] = [UserRole.TUTOR, UserRole.ADMIN],
  resource = 'resource',
): void {
  if (!user) {
    throw new ForbiddenException({
      error: 'FORBIDDEN',
      message: 'Authentication is required before ownership can be verified',
    });
  }

  if (staffRoles.includes(user.role)) {
    return;
  }

  assertSameSubject(user, ownerId, resource);
}