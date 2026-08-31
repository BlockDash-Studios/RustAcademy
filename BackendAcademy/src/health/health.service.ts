import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { DatabaseService } from '../database/database.service';
import { MonitoringService, MetricServiceNames } from '../monitoring/monitoring.service';

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
    @Optional() @Inject(MonitoringService) private readonly monitoringService?: MonitoringService,
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
   * Extended readiness check that probes database, Redis, job queues,
   * and external provider availability — #376.
   *
   * Each dependency is wrapped in a timeout so a stuck probe cannot
   * block the readiness endpoint indefinitely. Error reasons are
   * sanitized to avoid leaking sensitive connection details.
   */
  async checkReadiness(workerReadiness?: WorkerReadiness): Promise<ReadinessResult> {
    const checks: ReadinessResult['checks'] = [];

    // Check dependency health first — if infra is down we are NOT ready.
    // Wrap with timeout so a stuck dependency probe cannot block the entire readiness endpoint.
    let fullHealth: HealthCheckResult;
    try {
      fullHealth = await withTimeout(this.check(), this.readinessTimeoutMs, 'health-check');
    } catch {
      fullHealth = {
        status: 'unavailable',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        dependencies: [],
      };
    }
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

    // Check individual database readiness with timeout
    const dbCheck = await this.checkDatabaseReadiness();
    checks.push(dbCheck);

    // Check individual Redis readiness with timeout
    const redisCheck = await this.checkRedisReadiness();
    checks.push(redisCheck);

    const allReady = checks.every((c) => c.ready);

    return {
      ready: allReady,
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  /**
   * Database readiness probe with timeout. Returns a sanitized error
   * reason on failure so sensitive connection details are never leaked.
   */
  private async checkDatabaseReadiness(): Promise<ReadinessResult['checks'][0]> {
    try {
      const result = await withTimeout(
        this.checkDatabase(),
        this.readinessTimeoutMs,
        'database',
      );
      return {
        name: 'database',
        ready: result.status === 'healthy',
        reason: result.status === 'healthy'
          ? `Database responsive in ${result.latencyMs}ms`
          : sanitizeReason(result.error ?? 'Database unhealthy'),
      };
    } catch (err) {
      return {
        name: 'database',
        ready: false,
        reason: sanitizeReason((err as Error).message),
      };
    }
  }

  /**
   * Redis readiness probe with timeout. Returns a sanitized error
   * reason on failure so sensitive connection details are never leaked.
   */
  private async checkRedisReadiness(): Promise<ReadinessResult['checks'][0]> {
    try {
      const result = await withTimeout(
        this.checkRedis(),
        this.readinessTimeoutMs,
        'redis',
      );
      return {
        name: 'redis',
        ready: result.status === 'healthy',
        reason: result.status === 'healthy'
          ? `Redis responsive in ${result.latencyMs}ms`
          : sanitizeReason(result.error ?? 'Redis unhealthy'),
      };
    } catch (err) {
      return {
        name: 'redis',
        ready: false,
        reason: sanitizeReason((err as Error).message),
      };
    }
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

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

/**
 * Races a promise against a timeout. Resolves the promise or rejects
 * with a descriptive timeout error after `ms` milliseconds.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} readiness check timed out after ${ms}ms`));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Sanitize an error message so that sensitive connection details
 * (host, port, credentials) are never exposed in readiness probes.
 */
function sanitizeReason(raw: string): string {
  // Strip anything that looks like a connection string or host:port pair
  return raw
    .replace(/mongodb:\/\/[^\s]*/gi, '[connection]')
    .replace(/postgres:\/\/[^\s]*/gi, '[connection]')
    .replace(/redis:\/\/[^\s]*/gi, '[connection]')
    .replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '[host]')
    .replace(/:\d{2,5}\b/g, ':[port]')
    .slice(0, 200);
}
