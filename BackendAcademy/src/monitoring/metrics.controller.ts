import { Controller, Get, VERSION_NEUTRAL, Version, Res } from '@nestjs/common';
import { PrometheusController } from '@willsoto/nestjs-prometheus';
import type { Response } from 'express';

/**
 * Custom Prometheus endpoint controller.
 *
 * Extends the library's {@link PrometheusController} so that:
 * 1. The `path` metadata set by `PrometheusModule.register({ path })`
 *    still applies at runtime.
 * 2. The global API prefix and versioning policy configured in `main.ts`
 *    (`configureApiPolicy(app)`) is bypassed via {@link VERSION_NEUTRAL}
 *    on the `index` method, keeping the route at `/metrics` rather than
 *    `/api/v1/metrics`. This matches Prometheus best-practice (no URI
 *    versioning on the scrape target) so any off-the-shelf Prometheus /
 *    Grafana installation works out of the box.
 *
 * NOTE: `@Version` is *only* applied to the method (not the class) because
 * `@nestjs/common@10.4.22`'s `Version` factory dereferences `descriptor.value`,
 * which is `undefined` when the decorator targets a class and crashes at
 * runtime. Pinning it to the method keeps the call valid in TS and runtime.
 *
 * The `/metrics` endpoint is intentionally unauthenticated; production
 * deployments must restrict access at the infrastructure layer (firewall,
 * scrape-only VPC, or service-mesh allowlist).
 */
@Controller()
export class MetricsController extends PrometheusController {
  @Get()
  @Version(VERSION_NEUTRAL)
  async index(@Res({ passthrough: true }) response: Response): Promise<string> {
    return super.index(response);
  }
}
