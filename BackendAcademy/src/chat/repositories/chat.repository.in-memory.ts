import { ChatRoom, Message } from '../interfaces/chat.interface';
import { IChatRepository } from './chat.repository.interface';

/**
 * In-memory implementation of the chat repository.
 * Stores chat rooms and messages in process-local arrays.
 */
export class InMemoryChatRepository implements IChatRepository {
  private rooms: ChatRoom[] = [];
  private messages: Message[] = [];

  createRoom(room: ChatRoom): ChatRoom {
    this.rooms.push(room);
    return room;
  }

  findAllRooms(): ChatRoom[] {
    return this.rooms;
  }

  findRoomById(roomId: string): ChatRoom | undefined {
    return this.rooms.find((r) => r.id === roomId);
  }

  createMessage(message: Message): Message {
    this.messages.push(message);
    return message;
  }

  findMessagesByRoom(roomId: string): Message[] {
    return this.messages.filter((m) => m.roomId === roomId);
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

  clearAll(): void {
    this.rooms = [];
    this.messages = [];
  }
}
