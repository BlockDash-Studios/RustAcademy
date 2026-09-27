import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    Logger,
  } from '@nestjs/common';
  import { Observable } from 'rxjs';
  import { tap } from 'rxjs/operators';
  import { MetricsService } from './metrics.service';
  import { Request } from 'express';
  import { CorrelationContextService } from '../common/correlation/correlation-context.service';
  
  @Injectable()
  export class MetricsInterceptor implements NestInterceptor {
    private readonly logger = new Logger(MetricsInterceptor.name);

    constructor(
      private metricsService: MetricsService,
      private readonly correlationContext: CorrelationContextService,
    ) {}
  
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const start = Date.now();
      const req = context.switchToHttp().getRequest<Request>();
      const method = req.method;
      const route = req.route?.path || req.path;
      const correlationId = this.correlationContext.getCorrelationId() || req['correlationId'] || 'N/A';
  
      return next.handle().pipe(
        tap({
          next: () => {
            const res = context.switchToHttp().getResponse();
            const durationMs = Date.now() - start;
            const durationSec = durationMs / 1000;
            this.metricsService.recordRequestDuration(
              method,
              route,
              res.statusCode,
              durationSec,
            );
            this.logger.log(
              JSON.stringify({
                correlationId,
                event: 'http_request_completed',
                method,
                route,
                status_code: res.statusCode,
                duration_ms: durationMs,
              }),
            );
          },
          error: (err) => {
            const durationMs = Date.now() - start;
            const durationSec = durationMs / 1000;
            const statusCode = err.status || 500;
            this.metricsService.recordRequestDuration(
              method,
              route,
              statusCode,
              durationSec,
            );
            this.logger.warn(
              JSON.stringify({
                correlationId,
                event: 'http_request_failed',
                method,
                route,
                status_code: statusCode,
                duration_ms: durationMs,
                error: err.message,
              }),
            );
          },
        }),
      );
    }
  }