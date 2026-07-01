import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import {
  domainEventsCounterProvider,
  errorEventsCounterProvider,
  httpRequestsCounterProvider,
} from './monitoring.metrics';
import { MetricsController } from './metrics.controller';
import { MonitoringService } from './monitoring.service';

/**
 * Wires up Prometheus metrics for the RustAcademy backend.
 *
 * - {@link MetricsController} serves a `/metrics` endpoint that exposes the
 *   prom-client registry in Prometheus exposition format.
 *   {@link @Version(VERSION_NEUTRAL)} keeps the route at root despite the
 *   global `app.enableVersioning({ prefix: 'api/v' })` configured in main.ts.
 * - Default Node.js process metrics (CPU, memory, GC, event loop lag) are
 *   collected automatically.
 * - Reusable custom application counters are exposed via
 *   {@link MonitoringService}, which other modules can inject to record
 *   domain events without depending on `prom-client` directly.
 *
 * Production deployments must restrict access to `/metrics` at the
 * infrastructure layer (firewall, scrape-only VPC, or service-mesh allowlist).
 */
@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      controller: MetricsController,
      defaultMetrics: {
        enabled: true,
      },
      defaultLabels: {
        app: 'rustacademy-backend',
      },
    }),
  ],
  providers: [
    httpRequestsCounterProvider,
    domainEventsCounterProvider,
    errorEventsCounterProvider,
    MonitoringService,
  ],
  exports: [MonitoringService],
})
export class MonitoringModule {}
