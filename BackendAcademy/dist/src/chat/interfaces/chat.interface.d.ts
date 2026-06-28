export type ChatType = 'direct' | 'room';
export interface ChatRoom {
    id: string;
    name?: string;
    type: ChatType;
    participants: string[];
    createdAt: Date;
}
export interface Message {
    id: string;
    roomId: string;
    senderId: string;
    content: string;
    createdAt: Date;
}
