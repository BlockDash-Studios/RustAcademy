import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ChatRoom, Message } from './interfaces/chat.interface';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { ShareCodeSnippetDto } from './dto/share-code-snippet.dto';
import { ChatRateLimiter } from './chat-rate-limit';
import { SecurityService } from '../security/security.service';
import {
  ChatPage,
  IChatRepository,
  PageOptions,
} from './repositories/chat.repository.interface';
import { InMemoryChatRepository } from './repositories/chat.repository.in-memory';

/**
 * Chat service (#655).
 *
 * Storage is delegated to an {@link IChatRepository} that keeps rooms and
 * messages in **bounded** storage with retention, eviction, and pagination —
 * process-local arrays no longer grow without limit. This service layer adds
 * the business rules on top:
 * - Rate limiting per sender (shared across messages and code snippets).
 * - Prompt sanitisation for long content (#371).
 * - **Authorization**: posting to a room requires the room to exist and the
 *   sender to be listed in the room's `participants`; reading a room's
 *   messages requires the room to exist.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly rateLimiter = new ChatRateLimiter();
  private readonly repository: IChatRepository;

  /**
   * Length above which outgoing chat messages are run through the prompt
   * sanitiser (Issue #371). Short greetings / status pings are left alone
   * to avoid adding per-message latency to the common case.
   */
  private static readonly SANITISE_THRESHOLD = 280;

  constructor(
    @Optional() private readonly securityService?: SecurityService,
    @Optional() repository?: IChatRepository,
  ) {
    this.repository = repository ?? new InMemoryChatRepository();
  }

  createRoom(createRoomDto: CreateRoomDto): ChatRoom {
    const newRoom: ChatRoom = {
      id: Math.random().toString(36).substring(2, 9),
      ...createRoomDto,
      createdAt: new Date(),
    };
    return this.repository.createRoom(newRoom);
  }

  findAllRooms(options: PageOptions = {}): ChatPage<ChatRoom> {
    return this.repository.findAllRooms(options);
  }

  findRoomById(roomId: string): ChatRoom | undefined {
    return this.repository.findRoomById(roomId);
  }

  createMessage(createMessageDto: CreateMessageDto): Message {
    this.assertCanPost(createMessageDto.roomId, createMessageDto.senderId);
    this.enforceRateLimit(createMessageDto.senderId);
    const sanitisedContent = this.sanitiseIfNeeded(createMessageDto.content);
    const newMessage: Message = {
      id: Math.random().toString(36).substring(2, 9),
      ...createMessageDto,
      content: sanitisedContent.content,
      createdAt: new Date(),
    };
    return this.repository.createMessage(newMessage);
  }

  shareCodeSnippet(shareCodeSnippetDto: ShareCodeSnippetDto): Message {
    this.assertCanPost(shareCodeSnippetDto.roomId, shareCodeSnippetDto.senderId);
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

    return this.repository.createMessage(newMessage);
  }

  findMessagesByRoom(roomId: string, options: PageOptions = {}): ChatPage<Message> {
    if (!this.repository.findRoomById(roomId)) {
      throw new NotFoundException(`Chat room ${roomId} not found`);
    }
    return this.repository.findMessagesByRoom(roomId, options);
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
    return this.repository.markStreamingDisconnect(messageId);
  }

  /**
   * #373: Removes all incomplete messages from the in-memory store that
   * were abandoned due to streaming disconnects.
   */
  cleanupIncompleteMessages(): number {
    return this.repository.cleanupIncompleteMessages();
  }

  /**
   * #655: Prunes rooms/messages that have exceeded their retention window.
   * Called lazily by the repository on every read/write; exposed here for
   * maintenance/cleanup jobs.
   */
  pruneExpired(now?: Date): void {
    this.repository.pruneExpired(now);
  }

  /**
   * #655: Authorization rule for posting — the room must exist and the
   * sender must be one of its participants.
   */
  private assertCanPost(roomId: string, senderId: string): void {
    const room = this.repository.findRoomById(roomId);
    if (!room) {
      throw new NotFoundException(`Chat room ${roomId} not found`);
    }
    if (!room.participants.includes(senderId)) {
      throw new ForbiddenException(
        `Sender ${senderId} is not a participant of room ${roomId}`,
      );
    }
  }

  /**
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