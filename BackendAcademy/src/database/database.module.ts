import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MigrationService } from './migration.service';
import { MigrationController } from './migration.controller';
import { DatabaseService } from './database.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: config.get('NODE_ENV') !== 'production',
        ssl: config.get('NODE_ENV') === 'production' ? { rejectUnauthorized: false } : false,
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [MigrationController],
  providers: [DatabaseService, MigrationService],
  exports: [TypeOrmModule, DatabaseService, MigrationService],
})
export class DatabaseModule {}
