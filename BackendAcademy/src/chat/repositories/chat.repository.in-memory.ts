import { ChatRoom, Message } from '../interfaces/chat.interface';
import {
  ChatPage,
  ChatStorageConfig,
  DEFAULT_CHAT_STORAGE_CONFIG,
  IChatRepository,
  PageOptions,
} from './chat.repository.interface';

/** Hard cap applied to any requested page size. */
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;

/**
 * In-memory implementation of the chat repository (#655).
 *
 * Rooms and messages are stored in bounded, process-local arrays:
 * - `maxRooms` / `maxMessagesPerRoom` cap growth; the oldest entries are
 *   evicted (with their messages) when a bound is exceeded.
 * - `roomTtlMs` / `messageTtlMs` define the retention window; expired
 *   entries are pruned lazily on every read/write via {@link pruneExpired}.
 * - List queries are paginated (see {@link paginate}).
 */
export class InMemoryChatRepository implements IChatRepository {
  private rooms: ChatRoom[] = [];
  private messages: Message[] = [];

  constructor(
    private readonly config: ChatStorageConfig = DEFAULT_CHAT_STORAGE_CONFIG,
  ) {}

  createRoom(room: ChatRoom): ChatRoom {
    this.pruneExpired();
    this.rooms.push(room);
    this.enforceRoomBounds();
    return room;
  }

  findAllRooms(options: PageOptions = {}): ChatPage<ChatRoom> {
    this.pruneExpired();
    const sorted = [...this.rooms].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    return this.paginate(sorted, options);
  }

  findRoomById(roomId: string): ChatRoom | undefined {
    this.pruneExpired();
    return this.rooms.find((r) => r.id === roomId);
  }

  createMessage(message: Message): Message {
    this.pruneExpired();
    this.messages.push(message);
    this.enforceMessageBounds(message.roomId);
    return message;
  }

  findMessagesByRoom(roomId: string, options: PageOptions = {}): ChatPage<Message> {
    this.pruneExpired();
    const roomMessages = this.messages
      .filter((m) => m.roomId === roomId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return this.paginate(roomMessages, options);
  }

  markStreamingDisconnect(messageId: string): boolean {
    const msg = this.messages.find((m) => m.id === messageId);
    if (!msg) return false;
    (msg as any).streamingComplete = false;
    (msg as any).streamingAbortedAt = new Date();
    return true;
  }

  cleanupIncompleteMessages(): number {
    const before = this.messages.length;
    this.messages = this.messages.filter(
      (m) => (m as any).streamingComplete !== false,
    );
    return before - this.messages.length;
  }

  /**
   * Removes rooms and messages that have exceeded their retention window.
   * Expiring a room also drops all of its messages.
   */
  pruneExpired(now: Date = new Date()): void {
    const cutoff = now.getTime();

    this.messages = this.messages.filter(
      (m) => cutoff - m.createdAt.getTime() < this.config.messageTtlMs,
    );

    const activeRoomIds = new Set<string>();
    this.rooms = this.rooms.filter((r) => {
      const keep = cutoff - r.createdAt.getTime() < this.config.roomTtlMs;
      if (keep) activeRoomIds.add(r.id);
      return keep;
    });
    this.messages = this.messages.filter((m) => activeRoomIds.has(m.roomId));
  }

  clearAll(): void {
    this.rooms = [];
    this.messages = [];
  }

  /** Number of rooms currently stored (test/observability helper). */
  get roomCount(): number {
    return this.rooms.length;
  }

  /** Number of messages currently stored (test/observability helper). */
  get messageCount(): number {
    return this.messages.length;
  }

  private enforceRoomBounds(): void {
    while (this.rooms.length > this.config.maxRooms) {
      const oldest = this.rooms.reduce((a, b) =>
        a.createdAt.getTime() <= b.createdAt.getTime() ? a : b,
      );
      this.removeRoom(oldest.id);
    }
  }

  private enforceMessageBounds(roomId: string): void {
    const roomMessages = this.messages.filter((m) => m.roomId === roomId);
    const excess = roomMessages.length - this.config.maxMessagesPerRoom;
    if (excess <= 0) return;

    const evictIds = new Set(
      roomMessages
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, excess)
        .map((m) => m.id),
    );
    this.messages = this.messages.filter((m) => !evictIds.has(m.id));
  }

  private removeRoom(roomId: string): void {
    this.rooms = this.rooms.filter((r) => r.id !== roomId);
    this.messages = this.messages.filter((m) => m.roomId !== roomId);
  }

  private paginate<T extends { id: string }>(
    items: T[],
    options: PageOptions,
  ): ChatPage<T> {
    const limit = Math.min(
      Math.max(1, options.limit ?? DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );

    let startIndex = 0;
    if (options.cursor) {
      const idx = items.findIndex((item) => item.id === options.cursor);
      if (idx !== -1) startIndex = idx + 1;
    }

    const page = items.slice(startIndex, startIndex + limit);
    const more = startIndex + page.length < items.length;
    const nextCursor = page.length === limit && more
      ? page[page.length - 1].id
      : undefined;

    return { items: page, nextCursor };
  }
}
