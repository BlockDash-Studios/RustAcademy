import { Controller, Get, Inject, Optional, VERSION_NEUTRAL } from '@nestjs/common';
import { HealthService, ReadinessResult, HealthCheckResult, WorkerReadiness } from './health.service';
import { JobsService } from '../jobs/jobs.service';

@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthService,
    @Optional() @Inject(JobsService) private readonly jobsService?: JobsService,
  ) {}

  /**
   * Full health check including all infrastructure dependencies — #375.
   *
   * Returns the combined health status of Redis, database, and external
   * providers so operators can detect degraded services before they cause
   * user-facing failures.
   */
  @Get()
  async check(): Promise<HealthCheckResult> {
    return this.health.check();
  }

  /**
   * Kubernetes-style readiness probe — #376.
   *
   * Evaluates whether this instance is ready to receive traffic by
   * checking infrastructure health AND background worker/queue status.
   * Load balancers and orchestrators should route traffic only when this
   * endpoint returns HTTP 200 (ready: true).
   */
  @Get('ready')
  async ready(): Promise<ReadinessResult> {
    let workerReadiness: WorkerReadiness | undefined;
    if (this.jobsService) {
      try {
        workerReadiness = {
          ready: this.jobsService.isReady(),
          queueDepth: this.jobsService.getQueueDepth(),
          activeWorkers: 1,
          lastHeartbeat: this.jobsService.getLastHeartbeat(),
        };
      } catch {
        // JobsService probe failed — readiness will report degraded
        workerReadiness = { ready: false, queueDepth: -1, activeWorkers: 0 };
      }
    }

    return this.health.checkReadiness(workerReadiness);
  }

  /**
   * Lightweight liveness probe — confirms the process is alive without
   * checking any external dependencies.
   */
  @Get('live')
  liveness(): { alive: boolean; timestamp: string } {
    return this.health.checkLiveness();
  }
}
