import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MigrationService } from './migration.service';
import { MigrationController } from './migration.controller';
import { DatabaseService } from './database.service';
import { TransactionManagerService } from '../common/transaction-manager.service';

export function shouldSynchronizeSchema(nodeEnv: string | undefined): boolean {
  return !['production', 'staging'].includes(nodeEnv ?? 'development');
}

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const isTest = (config.get<string>('NODE_ENV') ?? process.env.NODE_ENV) === 'test';
        if (isTest) {
          return {
            type: 'sqljs' as any,
            driver: require('sql.js'),
            autoLoadEntities: false,
            synchronize: false,
          };
        }
        const dbUrl = config.get<string>('DATABASE_URL');
        return {
          type: 'postgres' as any,
          url: dbUrl,
          autoLoadEntities: true,
          // Schema changes in deployed environments must go through migrations.
          synchronize: shouldSynchronizeSchema(config.get<string>('NODE_ENV', 'development')),
          ssl: config.get('NODE_ENV') === 'production' ? { rejectUnauthorized: false } : false,
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [MigrationController],
  providers: [DatabaseService, MigrationService, TransactionManagerService],
  exports: [TypeOrmModule, DatabaseService, MigrationService, TransactionManagerService],
})
export class DatabaseModule {}
