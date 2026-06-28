import { Notification } from './interfaces/notifications.interface';
import { CreateNotificationDto } from './dto/create-notification.dto';
export declare class NotificationsService {
    private notifications;
    create(createNotificationDto: CreateNotificationDto): Notification;
    findAll(): Notification[];
    findByUserId(userId: string): Notification[];
}
