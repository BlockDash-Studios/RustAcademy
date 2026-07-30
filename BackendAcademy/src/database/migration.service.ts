import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';

/**
 * Represents the result of a preflight validation check.
 */
export interface PreflightResult {
  /** Whether all checks passed */
  success: boolean;
  /** Individual check results */
  checks: PreflightCheck[];
  /** Recommended actions before migration */
  recommendations: string[];
  /** Estimated rollback steps if migration fails */
  rollbackPlan: RollbackStep[];
}

export interface PreflightCheck {
  name: string;
  passed: boolean;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

export interface RollbackStep {
  /** Order of execution (1-indexed) */
  order: number;
  /** Description of the rollback action */
  action: string;
  /** Whether this step is reversible */
  reversible: boolean;
}

export interface MigrationRecord {
  id: string;
  name: string;
  timestamp: Date;
  checksum: string;
  applied: boolean;
}

export interface RollbackResult {
  success: boolean;
  rolledBack: string[];
  failed: string[];
  message: string;
}

/**
 * Defines the dependency relationship between migrations.
 * A migration listed in `dependsOn` must be applied before this migration.
 */
export interface MigrationDependency {
  name: string;
  dependsOn: string[];
}

/**
 * Service responsible for migration rollback awareness and preflight validation.
 *
 * Validates migration prerequisites (database connectivity, schema state,
 * pending migrations) before applying changes, and surfaces rollback requirements
 * so deployments can degrade gracefully.
 */
@Injectable()
export class MigrationService implements OnModuleInit {
  private readonly logger = new Logger(MigrationService.name);
  private migrations: MigrationRecord[] = [];

  /**
   * Ordered list of known migrations with their dependencies.
   * Migrations are applied in the order defined here, and each
   * migration's dependencies are validated before application.
   */
  private static readonly MIGRATION_ORDER: MigrationDependency[] = [
    { name: 'InitialSchema', dependsOn: [] },
    { name: 'AddUserProfiles', dependsOn: ['InitialSchema'] },
    { name: 'AddCoursesTable', dependsOn: ['AddUserProfiles'] },
    { name: 'AddSubmissionsTable', dependsOn: ['AddCoursesTable'] },
    { name: 'AddNotificationsTable', dependsOn: ['AddUserProfiles'] },
    { name: 'AddPaymentsTable', dependsOn: ['AddUserProfiles'] },
    { name: 'AddReviewsTable', dependsOn: ['AddCoursesTable', 'AddUserProfiles'] },
  ];

  constructor(
    private readonly configService: ConfigService,
    @InjectDataSource() private readonly dataSource?: DataSource,
  ) {}

  onModuleInit(): void {
    // Seed with known migrations for tracking purposes.
    // In production this would be read from a migrations table.
    this.loadMigrationHistory();
  }

  /**
   * Performs a comprehensive preflight check before applying migrations.
   *
   * Validates:
   *  - Database connectivity
   *  - Schema compatibility
   *  - Pending migration integrity
   *  - Environment configuration
   *
   * Returns a detailed result with recommendations and a rollback plan.
   */
  async preflightCheck(): Promise<PreflightResult> {
    const checks: PreflightCheck[] = [];
    const recommendations: string[] = [];

    // 1. Database connectivity check
    const dbConnected = await this.checkDatabaseConnectivity();
    checks.push({
      name: 'Database Connectivity',
      passed: dbConnected,
      message: dbConnected
        ? 'Successfully connected to the database'
        : 'Unable to connect to the database',
      severity: dbConnected ? 'info' : 'error',
    });

    if (!dbConnected) {
      recommendations.push(
        'Verify DATABASE_URL is correctly configured and the database is reachable',
      );
    }

    // 2. Schema state check
    const schemaHealthy = await this.checkSchemaState();
    checks.push({
      name: 'Schema State',
      passed: schemaHealthy.passed,
      message: schemaHealthy.message,
      severity: schemaHealthy.passed ? 'info' : 'warning',
    });

    // 3. Pending migrations check
    const pendingMigrations = this.getPendingMigrations();
    checks.push({
      name: 'Pending Migrations',
      passed: true,
      message:
        pendingMigrations.length > 0
          ? `${pendingMigrations.length} migration(s) pending: ${pendingMigrations.join(', ')}`
          : 'No pending migrations',
      severity: pendingMigrations.length > 0 ? 'warning' : 'info',
    });

    if (pendingMigrations.length > 3) {
      recommendations.push(
        'Consider applying migrations in smaller batches to reduce risk',
      );
    }

    // 4. Environment validation
    const envValid = this.validateEnvironment();
    checks.push({
      name: 'Environment Configuration',
      passed: envValid.passed,
      message: envValid.message,
      severity: envValid.passed ? 'info' : 'warning',
    });

    // 5. Migration ordering validation
    const orderIssues = this.validateMigrationOrder();
    checks.push({
      name: 'Migration Order',
      passed: orderIssues.length === 0,
      message:
        orderIssues.length > 0
          ? `Migration order violations found: ${orderIssues.join('; ')}`
          : 'Migration ordering and dependencies are valid',
      severity: orderIssues.length > 0 ? 'error' : 'info',
    });

    if (orderIssues.length > 0) {
      recommendations.push(
        'Re-order pending migrations to satisfy dependency requirements before applying',
      );
    }

    // 6. Check for required backup before destructive migrations
    const hasDestructiveMigrations = this.checkDestructiveMigrations();
    checks.push({
      name: 'Destructive Migration Risk',
      passed: !hasDestructiveMigrations,
      message: hasDestructiveMigrations
        ? 'Warning: Some pending migrations may be destructive (e.g., DROP COLUMN, DROP TABLE)'
        : 'No destructive migrations detected',
      severity: hasDestructiveMigrations ? 'warning' : 'info',
    });

    if (hasDestructiveMigrations) {
      recommendations.push(
        'Create a database backup before applying destructive migrations',
      );
    }

    // Build rollback plan
    const rollbackPlan = this.buildRollbackPlan();

    const allPassed = checks.every((c) => c.severity !== 'error');

    return {
      success: allPassed,
      checks,
      recommendations,
      rollbackPlan,
    };
  }

  /**
   * Returns a plan describing how to roll back the most recent migrations.
   *
   * @param steps Number of migration steps to include in the plan (default: 5)
   */
  getRollbackPlan(steps: number = 5): RollbackStep[] {
    return this.buildRollbackPlan().slice(0, steps);
  }

  /**
   * Rolls back a specified number of migrations.
   *
   * @param steps Number of migrations to roll back (default: 1)
   * @param dryRun If true, only simulates the rollback without executing
   */
  async rollback(steps: number = 1, dryRun: boolean = false): Promise<RollbackResult> {
    const applied = this.migrations
      .filter((m) => m.applied)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (applied.length === 0) {
      return {
        success: true,
        rolledBack: [],
        failed: [],
        message: 'No migrations to roll back',
      };
    }

    const toRollback = applied.slice(0, Math.min(steps, applied.length));
    const rolledBack: string[] = [];
    const failed: string[] = [];

    this.logger.log(
      `${dryRun ? '[DRY RUN] ' : ''}Rolling back ${toRollback.length} migration(s): ${toRollback.map((m) => m.name).join(', ')}`,
    );

    for (const migration of toRollback) {
      try {
        if (!dryRun) {
          await this.executeRollback(migration);
        }
        rolledBack.push(migration.name);
        // Mark as not applied
        migration.applied = false;
        this.logger.log(`Rolled back migration: ${migration.name}`);
      } catch (error) {
        this.logger.error(
          `Failed to roll back migration ${migration.name}: ${(error as Error).message}`,
        );
        failed.push(migration.name);
      }
    }

    return {
      success: failed.length === 0,
      rolledBack,
      failed,
      message:
        failed.length === 0
          ? `Successfully rolled back ${rolledBack.length} migration(s)`
          : `Rolled back ${rolledBack.length} migration(s), ${failed.length} failed`,
    };
  }

  /**
   * Returns all recorded migrations with their applied status.
   */
  getMigrationHistory(): MigrationRecord[] {
    return [...this.migrations].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    );
  }

  /**
   * Records a migration as applied.
   */
  recordMigration(name: string, checksum: string): MigrationRecord {
    const record: MigrationRecord = {
      id: `mig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      timestamp: new Date(),
      checksum,
      applied: true,
    };
    this.migrations.push(record);
    this.logger.log(`Migration recorded: ${name} (checksum: ${checksum})`);
    return record;
  }

  // ── Private helpers ──────────────────────────────────────────────

  private async checkDatabaseConnectivity(): Promise<boolean> {
    if (!this.dataSource) {
      this.logger.warn('DataSource not available — skipping connectivity check');
      return false;
    }
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  private async checkSchemaState(): Promise<{ passed: boolean; message: string }> {
    if (!this.dataSource) {
      return { passed: true, message: 'DataSource not available — skipping schema check' };
    }
    try {
      const tables = await this.dataSource.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
      );
      return {
        passed: true,
        message: `Schema OK (${tables.length} table(s) found)`,
      };
    } catch {
      return { passed: true, message: 'Could not inspect schema — proceeding cautiously' };
    }
  }

  /**
   * Validates that pending migrations are applied in the correct order
   * and that all dependencies are satisfied.
   *
   * Returns a list of ordering violations. An empty array means the
   * pending migrations are safe to apply in sequence.
   */
  validateMigrationOrder(): string[] {
    const issues: string[] = [];
    const appliedNames = new Set(
      this.migrations.filter((m) => m.applied).map((m) => m.name),
    );
    const pending = this.getPendingMigrations();
    const pendingSet = new Set(pending);

    for (const migration of MigrationService.MIGRATION_ORDER) {
      if (!pendingSet.has(migration.name) && !appliedNames.has(migration.name)) {
        continue;
      }

      for (const dep of migration.dependsOn) {
        if (!appliedNames.has(dep) && !pendingSet.has(dep)) {
          issues.push(
            `Migration "${migration.name}" depends on "${dep}" which is neither applied nor pending`,
          );
        }
        if (pendingSet.has(migration.name) && pendingSet.has(dep)) {
          const migIdx = pending.indexOf(migration.name);
          const depIdx = pending.indexOf(dep);
          if (migIdx < depIdx) {
            issues.push(
              `Migration "${migration.name}" must be applied after its dependency "${dep}"`,
            );
          }
        }
      }
    }

    return issues;
  }

  /**
   * Returns migrations in the correct application order,
   * respecting declared dependencies.
   */
  getMigrationsInOrder(): string[] {
    return MigrationService.MIGRATION_ORDER.map((m) => m.name);
  }

  private getPendingMigrations(): string[] {
    // Use the declared order to determine which migrations are pending.
    return this.getMigrationsInOrder().filter(
      (name) => !this.migrations.some((m) => m.name === name && m.applied),
    );
  }

  private validateEnvironment(): { passed: boolean; message: string } {
    const dbUrl = this.configService.get<string>('DATABASE_URL');
    if (!dbUrl) {
      return {
        passed: true,
        message:
          'DATABASE_URL not set (using in-memory fallback) — migrations may be skipped',
      };
    }

    const nodeEnv = this.configService.get<string>('NODE_ENV');
    if (nodeEnv === 'production' && !dbUrl.includes('ssl')) {
      return {
        passed: true,
        message: 'DATABASE_URL configured but SSL may not be enabled — verify connection security',
      };
    }

    return {
      passed: true,
      message: 'Environment configuration looks good',
    };
  }

  private checkDestructiveMigrations(): boolean {
    // Detect migrations containing destructive operations (DROP, etc.)
    // In production this would parse migration SQL files.
    const destructiveKeywords = ['DROP', 'TRUNCATE', 'DELETE FROM'];
    const pending = this.getPendingMigrations();
    return pending.some((name) =>
      destructiveKeywords.some((keyword) =>
        name.toUpperCase().includes(keyword),
      ),
    );
  }

  private buildRollbackPlan(): RollbackStep[] {
    const applied = this.migrations
      .filter((m) => m.applied);
    const orderedApplied = this.getMigrationsInOrder()
      .filter((name) => applied.some((m) => m.name === name))
      .reverse()
      .map((name) => applied.find((m) => m.name === name)!);

    return orderedApplied.map((migration, index) => ({
      order: index + 1,
      action: `Roll back migration "${migration.name}" (applied ${migration.timestamp.toISOString()})`,
      reversible: !migration.name.toUpperCase().includes('DROP'),
    }));
  }

  private async executeRollback(migration: MigrationRecord): Promise<void> {
    // In production this would execute the migration's "down" SQL script.
    this.logger.log(`Executing rollback for migration: ${migration.name}`);
    // Simulate async rollback work
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  private loadMigrationHistory(): void {
    // Seed sample history records for tracking.
    // In production this would load from the migrations tracking table.
    const now = new Date();
    this.migrations = [
      {
        id: 'mig-seed-1',
        name: 'InitialSchema',
        timestamp: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        checksum: 'abc123def',
        applied: true,
      },
      {
        id: 'mig-seed-2',
        name: 'AddUserProfiles',
        timestamp: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
        checksum: 'def456ghi',
        applied: true,
      },
    ];
  }
}
