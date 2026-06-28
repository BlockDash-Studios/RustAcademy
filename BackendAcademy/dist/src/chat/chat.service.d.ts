import { ChatRoom, Message } from './interfaces/chat.interface';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateRoomDto } from './dto/create-room.dto';
export declare class ChatService {
    private rooms;
    private messages;
    createRoom(createRoomDto: CreateRoomDto): ChatRoom;
    findAllRooms(): ChatRoom[];
    findRoomById(roomId: string): ChatRoom | undefined;
    createMessage(createMessageDto: CreateMessageDto): Message;
    findMessagesByRoom(roomId: string): Message[];
}
