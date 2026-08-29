import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { MetricsService } from './metrics.service';
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
    PrometheusModule.register({ defaultMetrics: { enabled: false } }),
  ],
  providers: [
    MetricsService,
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
  exports: [MetricsService],
})
export class MonitoringModule {}
