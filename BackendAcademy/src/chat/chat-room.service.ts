import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

/**
 * Chat rooms with membership and paginated history (BE-094).
 *
 * In-memory like the other services so a repository can be swapped in later.
 * The service is the source of truth for room membership: a user must join a
 * room before its history is meaningful to them, and leaving stops their
 * membership but keeps the message history intact for everyone else.
 */

export interface ChatRoom {
  id: string;
  name: string;
  topic: string;
  description: string;
  createdAt: string;
}

export interface RoomMessage {
  id: string;
  roomId: string;
  userId: string;
  content: string;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

interface PaginationOptions {
  page?: number;
  limit?: number;
}

const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class ChatRoomService {
  private readonly rooms = new Map<string, ChatRoom>();
  private readonly members = new Map<string, Set<string>>();
  private readonly messages = new Map<string, RoomMessage[]>();

  private nextRoomId = 1;
  private nextMessageId = 1;

  createRoom(input: { name: string; topic: string; description: string }): ChatRoom {
    if (!input.name || !input.name.startsWith('#')) {
      throw new BadRequestException('Room name must start with "#"');
    }

    const room: ChatRoom = {
      id: `room_${this.nextRoomId++}`,
      name: input.name,
      topic: input.topic,
      description: input.description,
      createdAt: new Date().toISOString(),
    };
    this.rooms.set(room.id, room);
    this.members.set(room.id, new Set());
    this.messages.set(room.id, []);
    return room;
  }

  getRoom(roomId: string): ChatRoom {
    const room = this.rooms.get(roomId);
    if (!room) throw new NotFoundException(`Room ${roomId} not found`);
    return room;
  }

  listRooms(options: PaginationOptions = {}): Paginated<ChatRoom & { memberCount: number }> {
    const { page = 1, limit = DEFAULT_PAGE_SIZE } = options;
    const allRooms = [...this.rooms.values()].map((room) => ({
      ...room,
      memberCount: this.members.get(room.id)?.size ?? 0,
    }));

    return paginate(allRooms, page, limit);
  }

  joinRoom(roomId: string, userId: string): void {
    this.getRoom(roomId);
    this.members.get(roomId)!.add(userId);
  }

  leaveRoom(roomId: string, userId: string): boolean {
    this.getRoom(roomId);
    return this.members.get(roomId)!.delete(userId);
  }

  getRoomMembers(roomId: string): string[] {
    this.getRoom(roomId);
    return [...(this.members.get(roomId) ?? [])];
  }

  addMessage(roomId: string, input: { userId: string; content: string }): RoomMessage {
    this.getRoom(roomId);

    const message: RoomMessage = {
      id: `msg_${this.nextMessageId++}`,
      roomId,
      userId: input.userId,
      content: input.content,
      createdAt: new Date().toISOString(),
    };
    this.messages.get(roomId)!.push(message);
    return message;
  }

  /** Newest page first, matching how chat history is read back in the UI. */
  getRoomHistory(roomId: string, options: PaginationOptions = {}): Paginated<RoomMessage> {
    this.getRoom(roomId);
    const { page = 1, limit = DEFAULT_PAGE_SIZE } = options;
    const history = [...(this.messages.get(roomId) ?? [])].reverse();

    return paginate(history, page, limit);
  }
}

function paginate<T>(items: T[], page: number, limit: number): Paginated<T> {
  const safePage = Math.max(1, Math.trunc(page));
  const safeLimit = Math.min(Math.max(1, Math.trunc(limit)), 100);
  const start = (safePage - 1) * safeLimit;

  return {
    items: items.slice(start, start + safeLimit),
    page: safePage,
    limit: safeLimit,
    total: items.length,
  };
}
