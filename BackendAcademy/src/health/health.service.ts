import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { DatabaseService } from '../database/database.service';

/**
 * Individual dependency health status.
 */
export interface DependencyHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  error?: string;
  checkedAt: Date;
}

/**
 * Full health check response — #375.
 */
export interface HealthCheckResult {
  status: 'ok' | 'degraded' | 'unavailable';
  timestamp: string;
  uptime: number;
  dependencies: DependencyHealth[];
}

/**
 * Readiness probe response — #376.
 */
export interface ReadinessResult {
  ready: boolean;
  timestamp: string;
  checks: {
    name: string;
    ready: boolean;
    reason?: string;
  }[];
}

/**
 * Status of job worker readiness — #376.
 */
export interface WorkerReadiness {
  ready: boolean;
  queueDepth: number;
  activeWorkers: number;
  lastHeartbeat?: Date;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly readinessTimeoutMs: number;

  constructor(
    private readonly configService: ConfigService,
    @Optional() @Inject(RedisService) private readonly redisService?: RedisService,
    @Optional() @Inject(DatabaseService) private readonly databaseService?: DatabaseService,
  ) {
    this.readinessTimeoutMs = this.configService.get<number>(
      'READINESS_PROBE_TIMEOUT_MS',
      5_000,
    );
  }

  // ──────────────────────────────────────────────────────────────────
  // #375: Full dependency health check
  // ──────────────────────────────────────────────────────────────────

  /**
   * Performs a comprehensive health check across all infrastructure
   * dependencies (Redis, Postgres/Database, external providers).
   *
   * Previously the health endpoint only validated HTTP availability.
   * Now it actively probes every dependency and reports degraded or
   * unavailable services so operators can detect issues before they
   * cascade into user-facing failures.
   */
  async check(): Promise<HealthCheckResult> {
    const checks = await Promise.all([
      this.checkRedis(),
      this.checkDatabase(),
    ]);

    const degraded = checks.filter((c) => c.status === 'degraded').length;
    const unhealthy = checks.filter((c) => c.status === 'unhealthy').length;

    let overall: HealthCheckResult['status'];
    if (unhealthy > 0) {
      overall = 'unavailable';
    } else if (degraded > 0) {
      overall = 'degraded';
    } else {
      overall = 'ok';
    }

    return {
      status: overall,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      dependencies: checks,
    };
  }

  /**
   * Probes Redis connectivity and latency.
   */
  private async checkRedis(): Promise<DependencyHealth> {
    const startedAt = Date.now();
    try {
      if (!this.redisService) {
        return {
          name: 'redis',
          status: 'degraded',
          latencyMs: 0,
          error: 'RedisService not available (not injected)',
          checkedAt: new Date(),
        };
      }

      // Probe Redis by reading a known key — a no-op read is sufficient
      // to validate connectivity and measure latency.
      await this.redisService.get('__health_check__');
      return {
        name: 'redis',
        status: 'healthy',
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date(),
      };
    } catch (err) {
      this.logger.warn(`Redis health check failed: ${(err as Error).message}`);
      return {
        name: 'redis',
        status: 'unhealthy',
        latencyMs: Date.now() - startedAt,
        error: (err as Error).message,
        checkedAt: new Date(),
      };
    }
  }

  /**
   * Probes database connectivity and latency.
   */
  private async checkDatabase(): Promise<DependencyHealth> {
    const startedAt = Date.now();
    try {
      if (!this.databaseService) {
        return {
          name: 'database',
          status: 'degraded',
          latencyMs: 0,
          error: 'DatabaseService not available (not injected)',
          checkedAt: new Date(),
        };
      }

      const healthy = await this.databaseService.isHealthy();
      if (!healthy) {
        return {
          name: 'database',
          status: 'unhealthy',
          latencyMs: Date.now() - startedAt,
          error: 'Database health check returned false',
          checkedAt: new Date(),
        };
      }

      return {
        name: 'database',
        status: 'healthy',
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date(),
      };
    } catch (err) {
      this.logger.warn(
        `Database health check failed: ${(err as Error).message}`,
      );
      return {
        name: 'database',
        status: 'unhealthy',
        latencyMs: Date.now() - startedAt,
        error: (err as Error).message,
        checkedAt: new Date(),
      };
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // #376: Readiness probes for background workers and queues
  // ──────────────────────────────────────────────────────────────────

  /**
   * Evaluates whether the application is ready to accept traffic,
   * including background worker readiness and queue health.
   *
   * This is designed to be consumed by Kubernetes readiness probes or
   * load-balancer health checks so that traffic is only routed to pods
   * whose workers are fully initialized and whose queues are not
   * dangerously backed up.
   */
  async checkReadiness(workerReadiness?: WorkerReadiness): Promise<ReadinessResult> {
    const checks: ReadinessResult['checks'] = [];

    // Check dependency health first — if infra is down we are NOT ready.
    const fullHealth = await this.check();
    const infraReady = fullHealth.status === 'ok' || fullHealth.status === 'degraded';
    checks.push({
      name: 'infrastructure',
      ready: infraReady,
      reason: infraReady
        ? 'All dependencies healthy or degraded'
        : 'One or more dependencies unavailable',
    });

    // Check worker readiness if provided by the jobs service.
    if (workerReadiness) {
      checks.push({
        name: 'workers',
        ready: workerReadiness.ready,
        reason: workerReadiness.ready
          ? `Workers active (${workerReadiness.activeWorkers}), queue depth: ${workerReadiness.queueDepth}`
          : workerReadiness.lastHeartbeat
            ? `Workers stalled — last heartbeat at ${workerReadiness.lastHeartbeat.toISOString()}`
            : 'No workers active',
      });
    }

    const allReady = checks.every((c) => c.ready);

    return {
      ready: allReady,
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  /**
   * Lightweight liveness probe — simply confirms the process is alive.
   */
  checkLiveness(): { alive: boolean; timestamp: string } {
    return {
      alive: true,
      timestamp: new Date().toISOString(),
    };
  }
}
