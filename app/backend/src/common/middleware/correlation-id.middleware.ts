import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { CorrelationContextService } from '../correlation/correlation-context.service';

/**
 * Middleware that extracts or generates a correlation ID for every inbound
 * HTTP request and makes it available in three places:
 *
 * 1. Response headers (`x-request-id` / `x-correlation-id`) — echoed back to clients.
 * 2. Express request object (`req.correlationId`) — used by filters and interceptors.
 * 3. `AsyncLocalStorage` context — used by any service in the same async call stack
 *    (DB queries, logging, metrics, downstream calls).
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  constructor(private readonly correlationContext: CorrelationContextService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const correlationId = req.header('x-request-id') || req.header('x-correlation-id') || uuidv4();
    // Expose as both the legacy header and the canonical request-id header
    res.setHeader('x-request-id', correlationId);
    res.setHeader('x-correlation-id', correlationId);
    req['correlationId'] = correlationId;
    // Propagate into AsyncLocalStorage so downstream services can read it
    this.correlationContext.setCorrelationId(correlationId);
    next();
  }
}