import { SetMetadata } from '@nestjs/common';

export const OWNERSHIP_KEY = 'ownershipParams';

/**
 * Declares which route params carry the authenticated user's own subject id.
 *
 * When combined with `SubjectOwnershipGuard`, non-admin callers are only
 * allowed through when the given `:param` value equals the JWT subject
 * (`req.user.sub`).
 *
 * Usage:
 * @Ownership('userId')
 */
export const Ownership = (...params: string[]) =>
  SetMetadata(OWNERSHIP_KEY, params);