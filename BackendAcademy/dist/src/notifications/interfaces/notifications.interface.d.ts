export interface Notification {
    id: string;
    userId: string;
    type: 'push' | 'in-app';
    title: string;
    message: string;
    isRead: boolean;
    createdAt: Date;
}
