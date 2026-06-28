export declare class CreateNotificationDto {
    userId: string;
    type: 'push' | 'in-app';
    title: string;
    message: string;
}
