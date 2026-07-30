import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { EmailService } from './email.service';
import { EmailNotificationProvider } from './providers/email.provider';
import { PushNotificationProvider } from './providers/push.provider';
import { InAppNotificationProvider } from './providers/in-app.provider';
import { NOTIFICATION_PROVIDERS } from './interfaces/notification-provider.interface';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    EmailService,
    EmailNotificationProvider,
    PushNotificationProvider,
    InAppNotificationProvider,
    {
      provide: NOTIFICATION_PROVIDERS,
      useFactory: (
        email: EmailNotificationProvider,
        push: PushNotificationProvider,
        inApp: InAppNotificationProvider,
      ) => [email, push, inApp],
      inject: [
        EmailNotificationProvider,
        PushNotificationProvider,
        InAppNotificationProvider,
      ],
    },
  ],
  exports: [
    NotificationsService,
    EmailService,
    EmailNotificationProvider,
    PushNotificationProvider,
    InAppNotificationProvider,
  ],
})
export class NotificationsModule {}
