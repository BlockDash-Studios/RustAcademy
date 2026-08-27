import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisModule } from '../redis/redis.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtLearnerGuard } from './guards/jwt-learner.guard';
import { JwtTutorGuard } from './guards/jwt-tutor.guard';
import { JwtAdminGuard } from './guards/jwt-admin.guard';
import { RolesGuard } from './guards/roles.guard';
import { SubjectOwnershipGuard } from './guards/subject-ownership.guard';
import { AuthSessionService } from './auth-session.service';
import { AuthSessionController } from './auth-session.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    ConfigModule,
    RedisModule,
    AuditModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'changeme'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthSessionController],
  providers: [
    JwtAuthGuard,
    JwtLearnerGuard,
    JwtTutorGuard,
    JwtAdminGuard,
    RolesGuard,
    SubjectOwnershipGuard,
    AuthSessionService,
  ],
  exports: [
    JwtModule,
    JwtAuthGuard,
    JwtLearnerGuard,
    JwtTutorGuard,
    JwtAdminGuard,
    RolesGuard,
    SubjectOwnershipGuard,
    AuthSessionService,
  ],
})
export class AuthModule {}
