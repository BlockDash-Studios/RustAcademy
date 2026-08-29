import { Test, TestingModule } from '@nestjs/testing';
import type { Counter, Gauge, Histogram } from 'prom-client';
import { getToken } from '@willsoto/nestjs-prometheus';
import {
  DOMAIN_EVENTS_METRIC,
  ERROR_EVENTS_METRIC,
  HTTP_REQUESTS_METRIC,
  SERVICE_ERRORS_METRIC,
  DOMAIN_OUTCOMES_METRIC,
  HTTP_LATENCY_METRIC,
  DATABASE_LATENCY_METRIC,
  REDIS_LATENCY_METRIC,
  AI_LATENCY_METRIC,
  GRADING_LATENCY_METRIC,
  PAYMENT_LATENCY_METRIC,
  NOTIFICATION_LATENCY_METRIC,
  JOBS_QUEUE_DEPTH_METRIC,
  DEAD_LETTER_QUEUE_DEPTH_METRIC,
} from './monitoring.metrics';
import { MonitoringService } from './monitoring.service';

/**
 * @willsoto/nestjs-prometheus resolves @InjectMetric(name) to
 * Inject(getToken(name)) where getToken returns `PROM_METRIC_${name.toUpperCase()}`.
 * Tests must provide their mocks under the same tokens.
 */
const HTTP_REQUESTS_TOKEN = getToken(HTTP_REQUESTS_METRIC);
const DOMAIN_EVENTS_TOKEN = getToken(DOMAIN_EVENTS_METRIC);
const ERROR_EVENTS_TOKEN = getToken(ERROR_EVENTS_METRIC);
const SERVICE_ERRORS_TOKEN = getToken(SERVICE_ERRORS_METRIC);
const DOMAIN_OUTCOMES_TOKEN = getToken(DOMAIN_OUTCOMES_METRIC);
const HTTP_LATENCY_TOKEN = getToken(HTTP_LATENCY_METRIC);
const DATABASE_LATENCY_TOKEN = getToken(DATABASE_LATENCY_METRIC);
const REDIS_LATENCY_TOKEN = getToken(REDIS_LATENCY_METRIC);
const AI_LATENCY_TOKEN = getToken(AI_LATENCY_METRIC);
const GRADING_LATENCY_TOKEN = getToken(GRADING_LATENCY_METRIC);
const PAYMENT_LATENCY_TOKEN = getToken(PAYMENT_LATENCY_METRIC);
const NOTIFICATION_LATENCY_TOKEN = getToken(NOTIFICATION_LATENCY_METRIC);
const JOBS_QUEUE_DEPTH_TOKEN = getToken(JOBS_QUEUE_DEPTH_METRIC);
const DEAD_LETTER_QUEUE_DEPTH_TOKEN = getToken(DEAD_LETTER_QUEUE_DEPTH_METRIC);

describe('MonitoringService', () => {
  let service: MonitoringService;
  let httpRequests: Counter<string>;
  let domainEvents: Counter<string>;
  let errorEvents: Counter<string>;
  let serviceErrors: Counter<string>;
  let domainOutcomes: Counter<string>;
  let httpLatency: Histogram<string>;
  let databaseLatency: Histogram<string>;
  let redisLatency: Histogram<string>;
  let aiLatency: Histogram<string>;
  let gradingLatency: Histogram<string>;
  let paymentLatency: Histogram<string>;
  let notificationLatency: Histogram<string>;
  let jobsQueueDepth: Gauge<string>;
  let deadLetterQueueDepth: Gauge<string>;

  beforeEach(async () => {
    const httpRequestsMock = { inc: jest.fn() } as unknown as Counter<string>;
    const domainEventsMock = { inc: jest.fn() } as unknown as Counter<string>;
    const errorEventsMock = { inc: jest.fn() } as unknown as Counter<string>;
    const serviceErrorsMock = { inc: jest.fn() } as unknown as Counter<string>;
    const domainOutcomesMock = { inc: jest.fn() } as unknown as Counter<string>;
    const httpLatencyMock = { observe: jest.fn() } as unknown as Histogram<string>;
    const databaseLatencyMock = { observe: jest.fn() } as unknown as Histogram<string>;
    const redisLatencyMock = { observe: jest.fn() } as unknown as Histogram<string>;
    const aiLatencyMock = { observe: jest.fn() } as unknown as Histogram<string>;
    const gradingLatencyMock = { observe: jest.fn() } as unknown as Histogram<string>;
    const paymentLatencyMock = { observe: jest.fn() } as unknown as Histogram<string>;
    const notificationLatencyMock = { observe: jest.fn() } as unknown as Histogram<string>;
    const jobsQueueDepthMock = { set: jest.fn() } as unknown as Gauge<string>;
    const deadLetterQueueDepthMock = { set: jest.fn() } as unknown as Gauge<string>;

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        MonitoringService,
        { provide: HTTP_REQUESTS_TOKEN, useValue: httpRequestsMock },
        { provide: DOMAIN_EVENTS_TOKEN, useValue: domainEventsMock },
        { provide: ERROR_EVENTS_TOKEN, useValue: errorEventsMock },
        { provide: SERVICE_ERRORS_TOKEN, useValue: serviceErrorsMock },
        { provide: DOMAIN_OUTCOMES_TOKEN, useValue: domainOutcomesMock },
        { provide: HTTP_LATENCY_TOKEN, useValue: httpLatencyMock },
        { provide: DATABASE_LATENCY_TOKEN, useValue: databaseLatencyMock },
        { provide: REDIS_LATENCY_TOKEN, useValue: redisLatencyMock },
        { provide: AI_LATENCY_TOKEN, useValue: aiLatencyMock },
        { provide: GRADING_LATENCY_TOKEN, useValue: gradingLatencyMock },
        { provide: PAYMENT_LATENCY_TOKEN, useValue: paymentLatencyMock },
        { provide: NOTIFICATION_LATENCY_TOKEN, useValue: notificationLatencyMock },
        { provide: JOBS_QUEUE_DEPTH_TOKEN, useValue: jobsQueueDepthMock },
        { provide: DEAD_LETTER_QUEUE_DEPTH_TOKEN, useValue: deadLetterQueueDepthMock },
      ],
    }).compile();

    service = moduleRef.get<MonitoringService>(MonitoringService);
    httpRequests = httpRequestsMock;
    domainEvents = domainEventsMock;
    errorEvents = errorEventsMock;
    serviceErrors = serviceErrorsMock;
    domainOutcomes = domainOutcomesMock;
    httpLatency = httpLatencyMock;
    databaseLatency = databaseLatencyMock;
    redisLatency = redisLatencyMock;
    aiLatency = aiLatencyMock;
    gradingLatency = gradingLatencyMock;
    paymentLatency = paymentLatencyMock;
    notificationLatency = notificationLatencyMock;
    jobsQueueDepth = jobsQueueDepthMock;
    deadLetterQueueDepth = deadLetterQueueDepthMock;
  });

  describe('recordHttpRequest', () => {
    it('increments the counter with a route prefixed by /', () => {
      service.recordHttpRequest('GET', 'health', 200);
      expect(httpRequests.inc).toHaveBeenCalledTimes(1);
      expect(httpRequests.inc).toHaveBeenCalledWith({
        method: 'GET',
        route: '/health',
        status_code: '200',
        tenant_id: 'unknown',
        request_id: 'unknown',
      });
    });

    it('does not double-prefix routes that already start with /', () => {
      service.recordHttpRequest('POST', '/social/posts', 201);
      expect(httpRequests.inc).toHaveBeenCalledWith({
        method: 'POST',
        route: '/social/posts',
        status_code: '201',
        tenant_id: 'unknown',
        request_id: 'unknown',
      });
    });

    it('uses / for an empty route to keep cardinality bounded', () => {
      service.recordHttpRequest('GET', '', 204);
      expect(httpRequests.inc).toHaveBeenCalledWith({
        method: 'GET',
        route: '/',
        status_code: '204',
        tenant_id: 'unknown',
        request_id: 'unknown',
      });
    });
  });

  describe('recordDomainEvent', () => {
    it('increments with the event_type and source labels', () => {
      service.recordDomainEvent('badge_awarded', 'badges');
      expect(domainEvents.inc).toHaveBeenCalledWith({
        event_type: 'badge_awarded',
        source: 'badges',
        tenant_id: 'unknown',
        request_id: 'unknown',
      });
    });
  });

  describe('recordError', () => {
    it('increments with the source and reason labels', () => {
      service.recordError('submissions', 'grading_failed');
      expect(errorEvents.inc).toHaveBeenCalledWith({
        source: 'submissions',
        reason: 'grading_failed',
        tenant_id: 'unknown',
        request_id: 'unknown',
      });
    });
  });

  describe('recordServiceError', () => {
    it('increments the service errors counter with service and error_type', () => {
      service.recordServiceError('database', 'timeout');
      expect(serviceErrors.inc).toHaveBeenCalledWith({
        service: 'database',
        error_type: 'timeout',
      });
    });

    it('works for all service types', () => {
      service.recordServiceError('redis', 'connection');
      expect(serviceErrors.inc).toHaveBeenCalledWith({
        service: 'redis',
        error_type: 'connection',
      });
    });
  });

  describe('recordHttpLatency', () => {
    it('observes latency in seconds (ms / 1000)', () => {
      service.recordHttpLatency('GET', '/health', 200, 150);
      expect(httpLatency.observe).toHaveBeenCalledWith(
        { method: 'GET', route: '/health', status_code: '200' },
        0.15,
      );
    });
  });

  describe('recordDatabaseLatency', () => {
    it('observes latency with operation and table labels', () => {
      service.recordDatabaseLatency('find', 'courses', 25);
      expect(databaseLatency.observe).toHaveBeenCalledWith(
        { operation: 'find', table: 'courses' },
        0.025,
      );
    });
  });

  describe('recordRedisLatency', () => {
    it('observes latency with operation label', () => {
      service.recordRedisLatency('get', 5);
      expect(redisLatency.observe).toHaveBeenCalledWith({ operation: 'get' }, 0.005);
    });
  });

  describe('recordAiLatency', () => {
    it('observes latency with provider and operation labels', () => {
      service.recordAiLatency('openai', 'chat', 2500);
      expect(aiLatency.observe).toHaveBeenCalledWith(
        { provider: 'openai', operation: 'chat' },
        2.5,
      );
    });
  });

  describe('recordGradingLatency', () => {
    it('observes latency with operation label', () => {
      service.recordGradingLatency('grade_submission', 500);
      expect(gradingLatency.observe).toHaveBeenCalledWith(
        { operation: 'grade_submission' },
        0.5,
      );
    });
  });

  describe('recordPaymentLatency', () => {
    it('observes latency with operation and provider labels', () => {
      service.recordPaymentLatency('create', 'stellar', 100);
      expect(paymentLatency.observe).toHaveBeenCalledWith(
        { operation: 'create', provider: 'stellar' },
        0.1,
      );
    });
  });

  describe('recordNotificationLatency', () => {
    it('observes latency with channel and operation labels', () => {
      service.recordNotificationLatency('email', 'send', 200);
      expect(notificationLatency.observe).toHaveBeenCalledWith(
        { channel: 'email', operation: 'send' },
        0.2,
      );
    });
  });

  describe('setJobsQueueDepth', () => {
    it('sets the gauge with queue and depth values', () => {
      service.setJobsQueueDepth('webhooks', 42);
      expect(jobsQueueDepth.set).toHaveBeenCalledWith({ queue: 'webhooks' }, 42);
    });
  });

  describe('setDeadLetterQueueDepth', () => {
    it('sets the gauge with queue and depth values', () => {
      service.setDeadLetterQueueDepth('webhooks', 3);
      expect(deadLetterQueueDepth.set).toHaveBeenCalledWith({ queue: 'webhooks' }, 3);
    });
  });

  describe('recordDomainOutcome', () => {
    it('increments with outcome, service, and status labels', () => {
      service.recordDomainOutcome('course_completed', 'courses', 'success');
      expect(domainOutcomes.inc).toHaveBeenCalledWith({
        outcome: 'course_completed',
        service: 'courses',
        status: 'success',
      });
    });

    it('tracks payment failure outcomes', () => {
      service.recordDomainOutcome('payment_processed', 'payment', 'failure');
      expect(domainOutcomes.inc).toHaveBeenCalledWith({
        outcome: 'payment_processed',
        service: 'payment',
        status: 'failure',
      });
    });
  });
});
