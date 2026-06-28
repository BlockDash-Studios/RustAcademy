import { ChatService } from './chat.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateRoomDto } from './dto/create-room.dto';
export declare class ChatController {
    private readonly chatService;
    constructor(chatService: ChatService);
    createRoom(createRoomDto: CreateRoomDto): import("./interfaces/chat.interface").ChatRoom;
    findAllRooms(): import("./interfaces/chat.interface").ChatRoom[];
    findRoom(roomId: string): import("./interfaces/chat.interface").ChatRoom;
    createMessage(createMessageDto: CreateMessageDto): import("./interfaces/chat.interface").Message;
    findMessagesByRoom(roomId: string): import("./interfaces/chat.interface").Message[];
}
