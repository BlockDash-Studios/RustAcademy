import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { AuditService } from './audit.service';
import { AUDIT_ACTION_KEY } from './decorators/audit-action.decorator';

type AuditableRequest = Record<string, unknown> & {
  method?: string;
  url?: string;
  originalUrl?: string;
  ip?: string;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
  user?: { id?: string; email?: string };
  apiKey?: { id?: string; name?: string };
  route?: { path?: string };
  rateLimitContext?: { group?: string; keyType?: string };
};

/**
 * Records a contextual, append-only audit log entry for every request that
 * passes through it — one entry on success, one on failure (Issue #551:
 * "abuse events record actor identity, route context, and request metadata").
 *
 * Apply directly, or via the `@SensitiveMutation(action)` decorator which
 * pairs this with the "sensitive" rate-limit group.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly auditService: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuditableRequest>();
    const action =
      this.reflector.getAllAndOverride<string>(AUDIT_ACTION_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? `${request.method ?? 'UNKNOWN'} ${this.routePath(request)}`;

    const actor = this.resolveActor(request);
    const target = request.originalUrl ?? request.url ?? this.routePath(request);
    const requestId = this.headerValue(request, 'x-request-id');
    const startedAt = Date.now();
    const baseMetadata = {
      method: request.method,
      path: this.routePath(request),
      params: request.params,
      // Query params only — request bodies are intentionally excluded to
      // avoid writing secrets/PII into the audit trail.
      query: request.query,
      ip: this.resolveIp(request),
      userAgent: this.headerValue(request, 'user-agent'),
      rateLimitGroup: request.rateLimitContext?.group,
    };

    return next.handle().pipe(
      tap(() => {
        void this.auditService.log(
          actor,
          action,
          target,
          { ...baseMetadata, outcome: 'success', durationMs: Date.now() - startedAt },
          requestId,
        );
      }),
      catchError((error: unknown) => {
        const err = error as { status?: number; statusCode?: number; message?: string };
        void this.auditService.log(
          actor,
          action,
          target,
          {
            ...baseMetadata,
            outcome: 'error',
            statusCode: err?.status ?? err?.statusCode,
            errorMessage: err?.message,
            durationMs: Date.now() - startedAt,
          },
          requestId,
        );
        return throwError(() => error);
      }),
    );
  }

  private routePath(request: AuditableRequest): string {
    return request.route?.path ?? request.url ?? request.originalUrl ?? 'unknown';
  }

  private resolveActor(request: AuditableRequest): string {
    if (request.user?.id) return `user_id:${request.user.id}`;
    if (request.user?.email) return `user_id:${request.user.email}`;
    if (request.apiKey?.id) return `api_key:${request.apiKey.id}`;

    const headerUserId = this.headerValue(request, 'x-user-id');
    if (headerUserId) return `user_id:${headerUserId}`;

    return `ip:${this.resolveIp(request)}`;
  }

  private resolveIp(request: AuditableRequest): string {
    const forwardedFor = this.headerValue(request, 'x-forwarded-for');
    if (forwardedFor) return forwardedFor.split(',')[0].trim();
    return request.ip ?? 'unknown';
  }

  private headerValue(request: AuditableRequest, name: string): string | undefined {
    const value = request.headers?.[name];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
