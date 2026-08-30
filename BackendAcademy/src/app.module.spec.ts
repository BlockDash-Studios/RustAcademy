import { MODULE_METADATA } from '@nestjs/common/constants';
import { AppController } from './app.controller';
import { AppModule } from './app.module';

describe('AppModule bootstrap registration', () => {
  it('registers every production feature module at the root', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as Array<
      | { module?: { name: string } }
      | { name: string }
    >;
    const importedModuleNames = imports.map(
      importedModule => importedModule.module?.name ?? importedModule.name,
    );

    expect(importedModuleNames).toEqual(
      expect.arrayContaining([
        'AdminModule',
        'AiModule',
        'AnalyticsModule',
        'AssetsModule',
        'AuthModule',
        'BadgesModule',
        'ChallengesModule',
        'ChatModule',
        'ContractsModule',
        'CourseModule',
        'DatabaseModule',
        'DlqModule',
        'HealthModule',
        'I18nModule',
        'JobsModule',
        'LeaderboardModule',
        'LessonModule',
        'LoggingModule',
        'MonitoringModule',
        'NotificationsModule',
        'OnboardingModule',
        'PaymentsModule',
        'PathfindingModule',
        'ProgressModule',
        'RedisModule',
        'ReportsModule',
        'RewardsModule',
        'SearchModule',
        'SecurityModule',
        'SessionsModule',
        'SocialModule',
        'SubmissionModule',
        'TaskModule',
        'TutorProfileModule',
        'UserProfileModule',
        'UsersModule',
        'WalletModule',
      ]),
    );
  });

  it('keeps root-level controllers intentional', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AppModule)).toEqual([
      AppController,
    ]);
  });
});