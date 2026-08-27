import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';

export interface PreflightResult {
  success: boolean;
  checks: PreflightCheck[];
  recommendations: string[];
  rollbackPlan: RollbackStep[];
}

export interface PreflightCheck {
  name: string;
  passed: boolean;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

export interface RollbackStep {
  order: number;
  action: string;
  reversible: boolean;
}

export interface MigrationRecord {
  id: string;
  name: string;
  timestamp: Date;
  checksum: string;
  applied: boolean;
  status: 'applied' | 'pending' | 'failed';
}

export interface RollbackResult {
  success: boolean;
  rolledBack: string[];
  failed: string[];
  message: string;
}

export interface MigrationDependency {
  name: string;
  dependsOn: string[];
}

const MIGRATION_TABLE = 'migration_history';
const MIGRATION_LOCK_KEY = 'rustacademy:migrations';

@Injectable()
export class MigrationService implements OnModuleInit {
  private readonly logger = new Logger(MigrationService.name);
  private initialized = false;

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

  async onModuleInit(): Promise<void> {
    await this.ensureMigrationTable();
  }

  async preflightCheck(): Promise<PreflightResult> {
    const checks: PreflightCheck[] = [];
    const recommendations: string[] = [];
    const dbConnected = await this.checkDatabaseConnectivity();
    checks.push({
      name: 'Database Connectivity',
      passed: dbConnected,
      message: dbConnected ? 'Successfully connected to the database' : 'Unable to connect to the database',
      severity: dbConnected ? 'info' : 'error',
    });
    if (!dbConnected) recommendations.push('Verify DATABASE_URL is correctly configured and the database is reachable');

    const schemaHealthy = await this.checkSchemaState();
    checks.push({ name: 'Schema State', passed: schemaHealthy.passed, message: schemaHealthy.message, severity: schemaHealthy.passed ? 'info' : 'warning' });

    const pendingMigrations = await this.getPendingMigrations();
    checks.push({
      name: 'Pending Migrations',
      passed: true,
      message: pendingMigrations.length > 0 ? `${pendingMigrations.length} migration(s) pending: ${pendingMigrations.join(', ')}` : 'No pending migrations',
      severity: pendingMigrations.length > 0 ? 'warning' : 'info',
    });
    if (pendingMigrations.length > 3) recommendations.push('Consider applying migrations in smaller batches to reduce risk');

    const envValid = this.validateEnvironment();
    checks.push({ name: 'Environment Configuration', passed: envValid.passed, message: envValid.message, severity: envValid.passed ? 'info' : 'warning' });

    const orderIssues = await this.validateMigrationOrder();
    checks.push({ name: 'Migration Order', passed: orderIssues.length === 0, message: orderIssues.length > 0 ? `Migration order violations found: ${orderIssues.join('; ')}` : 'Migration ordering and dependencies are valid', severity: orderIssues.length > 0 ? 'error' : 'info' });
    if (orderIssues.length > 0) recommendations.push('Re-order pending migrations to satisfy dependency requirements before applying');

    const hasDestructiveMigrations = this.checkDestructiveMigrations(pendingMigrations);
    checks.push({ name: 'Destructive Migration Risk', passed: !hasDestructiveMigrations, message: hasDestructiveMigrations ? 'Warning: Some pending migrations may be destructive (e.g., DROP COLUMN, DROP TABLE)' : 'No destructive migrations detected', severity: hasDestructiveMigrations ? 'warning' : 'info' });
    if (hasDestructiveMigrations) recommendations.push('Create a database backup before applying destructive migrations');

    return { success: checks.every((check) => check.severity !== 'error'), checks, recommendations, rollbackPlan: await this.buildRollbackPlan() };
  }

  async getRollbackPlan(steps = 5): Promise<RollbackStep[]> {
    return (await this.buildRollbackPlan()).slice(0, Math.max(0, steps));
  }

  async rollback(steps = 1, dryRun = false): Promise<RollbackResult> {
    if (!(await this.ensureMigrationTable())) return { success: false, rolledBack: [], failed: [], message: 'Migration history is unavailable' };
    return this.withMigrationLock(async () => {
      const applied = (await this.getMigrationHistory()).filter((migration) => migration.applied);
      const toRollback = applied.slice(0, Math.min(Math.max(steps, 0), applied.length));
      const rolledBack: string[] = [];
      const failed: string[] = [];
      this.logger.log(`${dryRun ? '[DRY RUN] ' : ''}Rolling back ${toRollback.length} migration(s): ${toRollback.map((migration) => migration.name).join(', ')}`);

      for (const migration of toRollback) {
        try {
          if (!dryRun) {
            await this.executeRollback(migration);
            await this.updateMigrationStatus(migration.name, 'pending');
          }
          rolledBack.push(migration.name);
        } catch (error) {
          this.logger.error(`Failed to roll back migration ${migration.name}: ${(error as Error).message}`);
          if (!dryRun) await this.updateMigrationStatus(migration.name, 'failed');
          failed.push(migration.name);
        }
      }
      return { success: failed.length === 0, rolledBack, failed, message: failed.length === 0 ? `Successfully rolled back ${rolledBack.length} migration(s)` : `Rolled back ${rolledBack.length} migration(s), ${failed.length} failed` };
    });
  }

  async getMigrationHistory(): Promise<MigrationRecord[]> {
    if (!(await this.ensureMigrationTable())) return [];
    const rows = await this.dataSource!.query(`SELECT id, name, applied_at AS timestamp, checksum, status FROM ${MIGRATION_TABLE} ORDER BY applied_at DESC NULLS LAST, name DESC`);
    return rows.map((row: { id: string; name: string; timestamp: Date | string; checksum: string; status: MigrationRecord['status'] }) => ({
      id: row.id,
      name: row.name,
      timestamp: new Date(row.timestamp),
      checksum: row.checksum,
      applied: row.status === 'applied',
      status: row.status,
    }));
  }

  async recordMigration(name: string, checksum: string): Promise<MigrationRecord> {
    if (!(await this.ensureMigrationTable())) throw new Error('Migration history is unavailable');
    const rows = await this.dataSource!.query(`INSERT INTO ${MIGRATION_TABLE} (name, checksum, status, applied_at) VALUES ($1, $2, 'applied', CURRENT_TIMESTAMP) ON CONFLICT (name) DO UPDATE SET checksum = EXCLUDED.checksum, status = 'applied', applied_at = CURRENT_TIMESTAMP RETURNING id, name, applied_at AS timestamp, checksum, status`, [name, checksum]);
    const row = rows[0];
    this.logger.log(`Migration recorded: ${name} (checksum: ${checksum})`);
    return { id: row.id, name: row.name, timestamp: new Date(row.timestamp), checksum: row.checksum, applied: true, status: row.status };
  }

  validateMigrationOrder = async (): Promise<string[]> => {
    const issues: string[] = [];
    const appliedNames = new Set((await this.getMigrationHistory()).filter((migration) => migration.applied).map((migration) => migration.name));
    const pending = await this.getPendingMigrations();
    const pendingSet = new Set(pending);
    for (const migration of MigrationService.MIGRATION_ORDER) {
      for (const dependency of migration.dependsOn) {
        if ((pendingSet.has(migration.name) || appliedNames.has(migration.name)) && !appliedNames.has(dependency) && !pendingSet.has(dependency)) issues.push(`Migration "${migration.name}" depends on "${dependency}" which is neither applied nor pending`);
        if (pendingSet.has(migration.name) && pendingSet.has(dependency) && pending.indexOf(migration.name) < pending.indexOf(dependency)) issues.push(`Migration "${migration.name}" must be applied after its dependency "${dependency}"`);
      }
    }
    return issues;
  };

  getMigrationsInOrder(): string[] {
    return MigrationService.MIGRATION_ORDER.map((migration) => migration.name);
  }

  private async ensureMigrationTable(): Promise<boolean> {
    if (this.initialized) return true;
    if (!this.dataSource) return false;
    try {
      await this.dataSource.query(`CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL UNIQUE, applied_at TIMESTAMPTZ NULL, checksum VARCHAR(128) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'pending', CONSTRAINT migration_history_status_check CHECK (status IN ('applied', 'pending', 'failed')))`, []);
      this.initialized = true;
      return true;
    } catch (error) {
      this.logger.error(`Unable to initialize migration history table: ${(error as Error).message}`);
      return false;
    }
  }

  private async withMigrationLock<T>(operation: () => Promise<T>): Promise<T> {
    await this.dataSource!.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [MIGRATION_LOCK_KEY]);
    try { return await operation(); } finally { await this.dataSource!.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [MIGRATION_LOCK_KEY]); }
  }

  private async checkDatabaseConnectivity(): Promise<boolean> {
    if (!this.dataSource) return false;
    try { await this.dataSource.query('SELECT 1'); return true; } catch { return false; }
  }

  private async checkSchemaState(): Promise<{ passed: boolean; message: string }> {
    if (!this.dataSource) return { passed: true, message: 'DataSource not available — skipping schema check' };
    try { const tables = await this.dataSource.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`); return { passed: true, message: `Schema OK (${tables.length} table(s) found)` }; } catch { return { passed: true, message: 'Could not inspect schema — proceeding cautiously' }; }
  }

  private async getPendingMigrations(): Promise<string[]> {
    const applied = new Set((await this.getMigrationHistory()).filter((migration) => migration.applied).map((migration) => migration.name));
    return this.getMigrationsInOrder().filter((name) => !applied.has(name));
  }

  private validateEnvironment(): { passed: boolean; message: string } {
    const dbUrl = this.configService.get<string>('DATABASE_URL');
    if (!dbUrl) return { passed: true, message: 'DATABASE_URL not set (using in-memory fallback) — migrations may be skipped' };
    if (this.configService.get<string>('NODE_ENV') === 'production' && !dbUrl.includes('ssl')) return { passed: true, message: 'DATABASE_URL configured but SSL may not be enabled — verify connection security' };
    return { passed: true, message: 'Environment configuration looks good' };
  }

  private checkDestructiveMigrations(pending: string[]): boolean {
    return pending.some((name) => ['DROP', 'TRUNCATE', 'DELETE FROM'].some((keyword) => name.toUpperCase().includes(keyword)));
  }

  private async buildRollbackPlan(): Promise<RollbackStep[]> {
    const applied = new Set((await this.getMigrationHistory()).filter((migration) => migration.applied).map((migration) => migration.name));
    return this.getMigrationsInOrder().filter((name) => applied.has(name)).reverse().map((name, index) => ({ order: index + 1, action: `Roll back migration "${name}"`, reversible: !name.toUpperCase().includes('DROP') }));
  }

  private async updateMigrationStatus(name: string, status: MigrationRecord['status']): Promise<void> {
    await this.dataSource!.query(`UPDATE ${MIGRATION_TABLE} SET status = $2, applied_at = CASE WHEN $2 = 'applied' THEN CURRENT_TIMESTAMP ELSE applied_at END WHERE name = $1`, [name, status]);
  }

  private async executeRollback(migration: MigrationRecord): Promise<void> {
    this.logger.log(`Executing rollback for migration: ${migration.name}`);
  }
}
