import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { ShareCodeSnippetDto } from './dto/share-code-snippet.dto';
import { PageOptions } from './repositories/chat.repository.interface';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('rooms')
  createRoom(@Body() createRoomDto: CreateRoomDto) {
    return this.chatService.createRoom(createRoomDto);
  }

  @Get('rooms')
  findAllRooms(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const options: PageOptions = {
      limit: limit ? Number(limit) : undefined,
      cursor,
    };
    return this.chatService.findAllRooms(options);
  }

  @Get('rooms/:roomId')
  findRoom(@Param('roomId') roomId: string) {
    return this.chatService.findRoomById(roomId);
  }

  @Post('messages')
  createMessage(@Body() createMessageDto: CreateMessageDto) {
    return this.chatService.createMessage(createMessageDto);
  }

  @Get('rooms/:roomId/messages')
  findMessagesByRoom(
    @Param('roomId') roomId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const options: PageOptions = {
      limit: limit ? Number(limit) : undefined,
      cursor,
    };
    return this.chatService.findMessagesByRoom(roomId, options);
  }

  @Post('messages/share-code')
  shareCodeSnippet(@Body() shareCodeSnippetDto: ShareCodeSnippetDto) {
    return this.chatService.shareCodeSnippet(shareCodeSnippetDto);
  }
}
