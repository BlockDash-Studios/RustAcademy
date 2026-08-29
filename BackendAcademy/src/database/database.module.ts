import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MigrationService } from './migration.service';
import { MigrationController } from './migration.controller';
import { DatabaseService } from './database.service';
import { TransactionManagerService } from '../common/transaction-manager.service';

/**
 * Determines whether TypeORM should auto-synchronize the schema.
 *
 * Synchronization is allowed only in local development and test environments.
 * Deployed environments (staging, production, qa, preview, etc.) must use
 * migrations as the only schema-change path, so this returns `false` for any
 * environment that is not explicitly allowlisted.
 */
export function shouldSynchronizeSchema(nodeEnv: string | undefined): boolean {
  const env = nodeEnv || 'development';
  return ['development', 'test'].includes(env);
}

Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        autoLoadEntities: true,
        // Schema changes in deployed environments must go through migrations.
        synchronize: shouldSynchronizeScchema(config.get<string>('NODE_ENV', 'development')),
        ssl: config.get('NODE_ENV') === 'production' ? { rejectUnauthorized: false } : false,
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [MigrationController],
  providers: [DatabaseService, MigrationService, TransactionManagerService],
  exports: [TypeOrmModule, DatabaseService, MigrationService, TransactionManagerService],
})
export class DatabaseModule {}
