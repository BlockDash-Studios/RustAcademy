import { HttpException, HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { ChatRoom, Message } from './interfaces/chat.interface';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { ShareCodeSnippetDto } from './dto/share-code-snippet.dto';
import { ChatRateLimiter } from './chat-rate-limit';
import { SecurityService } from '../security/security.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private rooms: ChatRoom[] = [];
  private messages: Message[] = [];
  private readonly rateLimiter = new ChatRateLimiter();

  /**
   * Length above which outgoing chat messages are run through the prompt
   * sanitiser (Issue #371). Short greetings / status pings are left alone
   * to avoid adding per-message latency to the common case.
   */
  private static readonly SANITISE_THRESHOLD = 280;

  constructor(
    @Optional() private readonly securityService?: SecurityService,
  ) {}

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
    this.enforceRateLimit(createMessageDto.senderId);
    const sanitisedContent = this.sanitiseIfNeeded(createMessageDto.content);
    const newMessage: Message = {
      id: Math.random().toString(36).substring(2, 9),
      ...createMessageDto,
      content: sanitisedContent.content,
      createdAt: new Date(),
    };
    this.messages.push(newMessage);
    return newMessage;
  }

  shareCodeSnippet(shareCodeSnippetDto: ShareCodeSnippetDto): Message {
    this.enforceRateLimit(shareCodeSnippetDto.senderId);
    const sanitisedContent = this.sanitiseIfNeeded(shareCodeSnippetDto.content);
    const newMessage: Message = {
      id: Math.random().toString(36).substring(2, 9),
      ...shareCodeSnippetDto,
      content: sanitisedContent.content,
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

  /**
   * #373: Marks in-flight chat messages as incomplete when a streaming
   * disconnect is detected. This prevents partial AI responses from
   * persisting in the conversation history.
   *
   * Messages flagged as incomplete can be filtered out by the frontend
   * or cleaned up by the `cleanupIncompleteMessages` method.
   */
  markStreamingDisconnect(messageId: string): boolean {
    const msg = this.messages.find((m) => m.id === messageId);
    if (!msg) return false;
    (msg as any).streamingComplete = false;
    (msg as any).streamingAbortedAt = new Date();
    return true;
  }

  /**
   * #373: Removes all incomplete messages from the in-memory store that
   * were abandoned due to streaming disconnects.
   */
  cleanupIncompleteMessages(): number {
    const before = this.messages.length;
    this.messages = this.messages.filter(
      (m) => (m as any).streamingComplete !== false,
    );
    return before - this.messages.length;
   * Run outgoing chat content through the SecurityService prompt sanitiser
   * when the content is long enough that it might plausibly be AI-bound or
   * carry instructions. The original behaviour is preserved when no
   * SecurityService is wired in (e.g. unit tests).
   */
  private sanitiseIfNeeded(content: string): { content: string } {
    if (!this.securityService || !content || content.length < ChatService.SANITISE_THRESHOLD) {
      return { content };
    }
    const result = this.securityService.sanitisePrompt(content);
    if (result.status === 'safe') {
      return { content };
    }
    if (result.status === 'rejected') {
      this.logger.warn(
        `[#371] chat message blocked — reasons=${result.reasons.join(',')}`,
      );
      return { content: result.sanitised };
    }
    this.logger.debug(
      `[#371] chat message wrapped — reasons=${result.reasons.join(',')}`,
    );
    return { content: result.sanitised };
  }

  private enforceRateLimit(senderId: string): void {
    const { allowed, retryAfterSeconds } = this.rateLimiter.check(senderId);
    if (!allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Chat rate limit exceeded. Please slow down.',
          retryAfter: retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
