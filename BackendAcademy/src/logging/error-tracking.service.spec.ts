import { ErrorTrackingService, ErrorTrackingReport } from './error-tracking.service';

describe('ErrorTrackingService', () => {
  let service: ErrorTrackingService;

  beforeEach(() => {
    service = new ErrorTrackingService();
  });

  it('captures an exception as a structured placeholder report', () => {
    const report = service.captureException(new Error('boom'), 'users');

    expect(report).toEqual(
      expect.objectContaining({
        source: 'placeholder',
        context: 'users',
        message: 'boom',
      }),
    );
    expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('initializes process handlers without throwing', () => {
    expect(() => service.onModuleInit()).not.toThrow();
  });
});
