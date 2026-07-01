import { Test, TestingModule } from '@nestjs/testing';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { MonitoringModule } from './monitoring.module';
import { MonitoringService } from './monitoring.service';

describe('MonitoringModule', () => {
  it('compiles and exposes MonitoringService when imported', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [MonitoringModule],
    }).compile();

    expect(moduleRef.get(MonitoringService)).toBeInstanceOf(MonitoringService);
  });

  it('still exposes MonitoringService alongside an additional PrometheusModule registration', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        MonitoringModule,
        PrometheusModule.register({ defaultMetrics: { enabled: false } }),
      ],
    }).compile();

    expect(moduleRef.get(MonitoringService)).toBeInstanceOf(MonitoringService);
  });
});
