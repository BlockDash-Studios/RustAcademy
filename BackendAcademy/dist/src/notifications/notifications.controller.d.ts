import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
export declare class NotificationsController {
    private readonly notificationsService;
    constructor(notificationsService: NotificationsService);
    create(createNotificationDto: CreateNotificationDto): import("./interfaces/notifications.interface").Notification;
    findAll(): import("./interfaces/notifications.interface").Notification[];
    findByUserId(userId: string): import("./interfaces/notifications.interface").Notification[];
}
