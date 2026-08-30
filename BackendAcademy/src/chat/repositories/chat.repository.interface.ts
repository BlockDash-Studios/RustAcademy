import { ChatRoom, Message } from '../interfaces/chat.interface';

/**
 * A single page of results from a paginated chat query.
 */
export interface ChatPage<T> {
  items: T[];
  /** Opaque cursor for fetching the next page. Undefined when no more pages. */
  nextCursor?: string;
}

/**
 * Pagination options for chat list endpoints (#655).
 */
export interface PageOptions {
  /** Maximum number of items to return (clamped to [1, 100]). */
  limit?: number;
  /** Opaque cursor returned by a previous page. */
  cursor?: string;
}

/**
 * Storage limits and retention policy for chat data (#655).
 *
 * Rooms and messages are kept in bounded, process-local storage: when a
 * limit is exceeded the oldest entries are evicted, and entries older than
 * their retention window are pruned lazily on every read/write.
 */
export interface ChatStorageConfig {
  /** Maximum number of rooms retained at once. */
  maxRooms: number;
  /** Maximum number of messages retained per room. */
  maxMessagesPerRoom: number;
  /** How long a room is retained before it expires (ms). */
  roomTtlMs: number;
  /** How long a message is retained before it expires (ms). */
  messageTtlMs: number;
}

export const DEFAULT_CHAT_STORAGE_CONFIG: ChatStorageConfig = {
  maxRooms: 1000,
  maxMessagesPerRoom: 500,
  roomTtlMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  messageTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
};

/**
 * Repository interface for chat storage.
 * Isolates persistence concerns from business logic.
 */
export interface IChatRepository {
  /**
   * Create a new chat room. Enforces the room bound and retention policy.
   */
  createRoom(room: ChatRoom): ChatRoom;

  /**
   * Get chat rooms (newest first), paginated.
   */
  findAllRooms(options?: PageOptions): ChatPage<ChatRoom>;

  /**
   * Find a specific room by ID.
   */
  findRoomById(roomId: string): ChatRoom | undefined;

  /**
   * Create a new message. Enforces the per-room message bound and retention.
   */
  createMessage(message: Message): Message;

  /**
   * Get all messages for a specific room (oldest first), paginated.
   */
  findMessagesByRoom(roomId: string, options?: PageOptions): ChatPage<Message>;

  /**
   * Mark a message as incomplete due to streaming disconnect.
   */
  markStreamingDisconnect(messageId: string): boolean;

  /**
   * Remove all incomplete messages.
   */
  cleanupIncompleteMessages(): number;

  /**
   * Prune rooms/messages that have exceeded their retention window.
   */
  pruneExpired(now?: Date): void;

  /**
   * Clear all chat data (useful for testing).
   */
  clearAll(): void;
}
