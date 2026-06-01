import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extracts the actor's public key (or identifier) from the request context.
 * Used for audit logging to identify who performed an operation.
 *
 * For API key authenticated requests, uses the API key's owner_id or name.
 * For public requests, defaults to "anonymous".
 *
 * @example
 * async someAction(@ActorPublicKey() requesterPublicKey: string) {
 *   await this.auditService.log(requesterPublicKey, 'action', ...);
 * }
 */
export const ActorPublicKey = createParamDecorator(
  (_, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();

    // If API key is present, use the key name or owner_id
    if (request.apiKey) {
      return request.apiKey.name || request.apiKey.id || 'api-key-unknown';
    }

    // If there's an authenticated user/org context
    if (request.organizationContext?.organizationId) {
      return request.organizationContext.organizationId;
    }

    // Default to anonymous for public requests
    return 'anonymous';
  },
);
