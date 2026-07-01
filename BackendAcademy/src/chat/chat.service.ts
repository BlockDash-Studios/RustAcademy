import { Injectable } from '@nestjs/common';
import { ChatRoom, Message } from './interfaces/chat.interface';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { ShareCodeSnippetDto } from './dto/share-code-snippet.dto';

@Injectable()
export class ChatService {
  private rooms: ChatRoom[] = [];
  private messages: Message[] = [];

  createRoom(createRoomDto: CreateRoomDto): ChatRoom {
    const newRoom: ChatRoom = {
      id: Math.random().toString(36).substring(2, 9),
      ...createRoomDto,
      createdAt: new Date(),
    };
    this.rooms.push(newRoom);
    return newRoom;
  }

  findAllRooms(): ChatRoom[] {
    return this.rooms;
  }

  findRoomById(roomId: string): ChatRoom | undefined {
    return this.rooms.find((r) => r.id === roomId);
  }

  createMessage(createMessageDto: CreateMessageDto): Message {
    const newMessage: Message = {
      id: Math.random().toString(36).substring(2, 9),
      ...createMessageDto,
      createdAt: new Date(),
    };
    this.messages.push(newMessage);
    return newMessage;
  }

  shareCodeSnippet(shareCodeSnippetDto: ShareCodeSnippetDto): Message {
    const newMessage: Message = {
      id: Math.random().toString(36).substring(2, 9),
      ...shareCodeSnippetDto,
      codeSnippet: {
        code: shareCodeSnippetDto.code,
        language: shareCodeSnippetDto.language,
        title: shareCodeSnippetDto.title,
      },
      createdAt: new Date(),
    };

    this.messages.push(newMessage);
    return newMessage;
  }

  findMessagesByRoom(roomId: string): Message[] {
    return this.messages.filter((m) => m.roomId === roomId);
  }
}
