import { SetMetadata } from '@nestjs/common';

export const AUDIT_ACTION_KEY = 'audit_action';

/**
 * Declare a stable action name for a route's audit log entries.
 *
 * When absent, AuditInterceptor falls back to `${method} ${path}` — which
 * works but is harder to filter/alert on than a deliberate name like
 * "marketplace.listing.accept_bid".
 *
 * @example
 * \@AuditAction('marketplace.listing.accept_bid')
 * \@Post(':listingId/accept-bid/:bidId')
 * acceptBid() {}
 */
export const AuditAction = (action: string) => SetMetadata(AUDIT_ACTION_KEY, action);
