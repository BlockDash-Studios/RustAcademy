import { Test, TestingModule } from '@nestjs/testing';
import type { Counter } from 'prom-client';
import { getToken } from '@willsoto/nestjs-prometheus';
import {
  DOMAIN_EVENTS_METRIC,
  ERROR_EVENTS_METRIC,
  HTTP_REQUESTS_METRIC,
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

describe('MonitoringService', () => {
  let service: MonitoringService;
  let httpRequests: Counter<string>;
  let domainEvents: Counter<string>;
  let errorEvents: Counter<string>;

  beforeEach(async () => {
    const httpRequestsMock = { inc: jest.fn() } as unknown as Counter<string>;
    const domainEventsMock = { inc: jest.fn() } as unknown as Counter<string>;
    const errorEventsMock = { inc: jest.fn() } as unknown as Counter<string>;

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        MonitoringService,
        { provide: HTTP_REQUESTS_TOKEN, useValue: httpRequestsMock },
        { provide: DOMAIN_EVENTS_TOKEN, useValue: domainEventsMock },
        { provide: ERROR_EVENTS_TOKEN, useValue: errorEventsMock },
      ],
    }).compile();

    service = moduleRef.get<MonitoringService>(MonitoringService);
    httpRequests = httpRequestsMock;
    domainEvents = domainEventsMock;
    errorEvents = errorEventsMock;
  });

  describe('recordHttpRequest', () => {
    it('increments the counter with a route prefixed by /', () => {
      service.recordHttpRequest('GET', 'health', 200);
      expect(httpRequests.inc).toHaveBeenCalledTimes(1);
      expect(httpRequests.inc).toHaveBeenCalledWith({
        method: 'GET',
        route: '/health',
        status_code: '200',
      });
    });

    it('does not double-prefix routes that already start with /', () => {
      service.recordHttpRequest('POST', '/social/posts', 201);
      expect(httpRequests.inc).toHaveBeenCalledWith({
        method: 'POST',
        route: '/social/posts',
        status_code: '201',
      });
    });

    it('uses / for an empty route to keep cardinality bounded', () => {
      service.recordHttpRequest('GET', '', 204);
      expect(httpRequests.inc).toHaveBeenCalledWith({
        method: 'GET',
        route: '/',
        status_code: '204',
      });
    });
  });

  describe('recordDomainEvent', () => {
    it('increments with the event_type and source labels', () => {
      service.recordDomainEvent('badge_awarded', 'badges');
      expect(domainEvents.inc).toHaveBeenCalledWith({
        event_type: 'badge_awarded',
        source: 'badges',
      });
    });
  });

  describe('recordError', () => {
    it('increments with the source and reason labels', () => {
      service.recordError('submissions', 'grading_failed');
      expect(errorEvents.inc).toHaveBeenCalledWith({
        source: 'submissions',
        reason: 'grading_failed',
      });
    });
  });
});
