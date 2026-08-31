import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { MetricsService } from './metrics.service';
import { MonitoringService } from './monitoring.service';
import { MetricsController } from './metrics.controller';
import {
  httpRequestsCounterProvider,
  domainEventsCounterProvider,
  errorEventsCounterProvider,
  serviceErrorsCounterProvider,
  domainOutcomesCounterProvider,
  httpLatencyHistogramProvider,
  databaseLatencyHistogramProvider,
  redisLatencyHistogramProvider,
  aiLatencyHistogramProvider,
  gradingLatencyHistogramProvider,
  paymentLatencyHistogramProvider,
  notificationLatencyHistogramProvider,
  jobsQueueDepthGaugeProvider,
  deadLetterQueueDepthGaugeProvider,
} from './monitoring.metrics';

@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: { enabled: false },
      controller: MetricsController,
    }),
  ],
  controllers: [MetricsController],
  providers: [
    MetricsService,
    MonitoringService,
    httpRequestsCounterProvider,
    domainEventsCounterProvider,
    errorEventsCounterProvider,
    serviceErrorsCounterProvider,
    domainOutcomesCounterProvider,
    httpLatencyHistogramProvider,
    databaseLatencyHistogramProvider,
    redisLatencyHistogramProvider,
    aiLatencyHistogramProvider,
    gradingLatencyHistogramProvider,
    paymentLatencyHistogramProvider,
    notificationLatencyHistogramProvider,
    jobsQueueDepthGaugeProvider,
    deadLetterQueueDepthGaugeProvider,
  ],
  exports: [MetricsService, MonitoringService, PrometheusModule],
})
export class MonitoringModule {}