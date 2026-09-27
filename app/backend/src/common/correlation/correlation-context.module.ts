/**
 * Correlation Context Module
 *
 * Provides the `CorrelationContextService` as a singleton across the
 * application. Import this module in any feature module that needs to
 * read or write the current correlation identifier.
 *
 * The service is backed by `AsyncLocalStorage`, so it works across
 * HTTP middleware, background job execution, database calls, and any
 * other async flow without explicit parameter threading.
 */

import { Module, Global } from '@nestjs/common';
import { CorrelationContextService } from './correlation-context.service';

@Global()
@Module({
  providers: [CorrelationContextService],
  exports: [CorrelationContextService],
})
export class CorrelationContextModule {}
