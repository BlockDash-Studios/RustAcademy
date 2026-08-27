import { ChatRoom, Message } from '../interfaces/chat.interface';

/**
 * Repository interface for chat storage.
 * Isolates persistence concerns from business logic.
 */
export interface IChatRepository {
  /**
   * Create a new chat room.
   */
  createRoom(room: ChatRoom): ChatRoom;

  /**
   * Get all chat rooms.
   */
  findAllRooms(): ChatRoom[];

  /**
   * Find a specific room by ID.
   */
  findRoomById(roomId: string): ChatRoom | undefined;

  /**
   * Create a new message.
   */
  createMessage(message: Message): Message;

  /**
   * Get all messages for a specific room.
   */
  findMessagesByRoom(roomId: string): Message[];

  /**
   * Mark a message as incomplete due to streaming disconnect.
   */
  markStreamingDisconnect(messageId: string): boolean;

  /**
   * Remove all incomplete messages.
   */
  cleanupIncompleteMessages(): number;

  /**
   * Clear all chat data (useful for testing).
   */
  clearAll(): void;
}
