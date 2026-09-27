import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { RateLimitGroupTag } from './rate-limit-group.decorator';
import { AuditInterceptor } from '../../audit/audit.interceptor';
import { AuditAction } from '../../audit/decorators/audit-action.decorator';

/**
 * Marks a route as an admin/auth/payment-sensitive mutation (Issue #551):
 *
 *   - Tags it for the "sensitive" rate-limit group, which applies a much
 *     stricter per-user (or per-API-key) limit AND an independent per-IP
 *     limit — see CustomThrottlerGuard and rate-limit.config.ts.
 *   - Records a contextual audit log entry (actor identity, route, request
 *     metadata) on every call, success or failure, via AuditInterceptor.
 *
 * The consuming module must import AuditModule (for AuditInterceptor's
 * dependencies to resolve).
 *
 * @example
 * \@SensitiveMutation('marketplace.listing.accept_bid')
 * \@Post(':listingId/accept-bid/:bidId')
 * acceptBid() {}
 */
export const SensitiveMutation = (action: string) =>
  applyDecorators(
    RateLimitGroupTag('sensitive'),
    UseInterceptors(AuditInterceptor),
    AuditAction(action),
  );
