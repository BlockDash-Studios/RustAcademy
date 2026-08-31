import { ForbiddenException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { ChatService } from './chat.service';
import {
  ChatRateLimiter,
  DEFAULT_CHAT_RATE_LIMIT,
} from './chat-rate-limit';
import { InMemoryChatRepository } from './repositories/chat.repository.in-memory';

/** Creates a room and returns its id. */
function createRoom(service: ChatService, participants: string[], name = 'room-1'): string {
  const room = service.createRoom({ name, type: 'room', participants });
  return room.id;
}

describe('ChatRateLimiter', () => {
  it('allows messages up to the configured limit then blocks', () => {
    const limiter = new ChatRateLimiter({ maxMessages: 3, windowMs: 1000 });
    const now = 1_000_000;

    expect(limiter.check('session-1', now).allowed).toBe(true);
    expect(limiter.check('session-1', now).allowed).toBe(true);
    expect(limiter.check('session-1', now).allowed).toBe(true);

    const blocked = limiter.check('session-1', now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('tracks each session independently', () => {
    const limiter = new ChatRateLimiter({ maxMessages: 1, windowMs: 1000 });
    const now = 1_000_000;

    expect(limiter.check('session-a', now).allowed).toBe(true);
    expect(limiter.check('session-a', now).allowed).toBe(false);
    // A different session is unaffected by session-a's usage.
    expect(limiter.check('session-b', now).allowed).toBe(true);
  });

  it('allows messages again once the window has elapsed', () => {
    const limiter = new ChatRateLimiter({ maxMessages: 1, windowMs: 1000 });
    const start = 1_000_000;

    expect(limiter.check('session-1', start).allowed).toBe(true);
    expect(limiter.check('session-1', start).allowed).toBe(false);
    // Past the window the slate is clean.
    expect(limiter.check('session-1', start + 1001).allowed).toBe(true);
  });
});

describe('ChatService rate limiting', () => {
  it('rejects messages once a session exceeds the limit', () => {
    const service = new ChatService();
    const roomId = createRoom(service, ['spammer']);
    const send = () =>
      service.createMessage({
        roomId,
        senderId: 'spammer',
        content: 'hi',
      });

    for (let i = 0; i < DEFAULT_CHAT_RATE_LIMIT.maxMessages; i++) {
      expect(() => send()).not.toThrow();
    }

    expect(() => send()).toThrow(HttpException);
    try {
      send();
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  });

  it('shares the limit across createMessage and shareCodeSnippet', () => {
    const service = new ChatService();
    const roomId = createRoom(service, ['user-1']);
    for (let i = 0; i < DEFAULT_CHAT_RATE_LIMIT.maxMessages; i++) {
      service.createMessage({
        roomId,
        senderId: 'user-1',
        content: 'hi',
      });
    }

    expect(() =>
      service.shareCodeSnippet({
        roomId,
        senderId: 'user-1',
        content: 'snippet',
        code: 'fn main() {}',
        language: 'rust',
      }),
    ).toThrow(HttpException);
  });
});

describe('ChatService code snippet sharing', () => {
  it('creates a shared code snippet message with metadata', () => {
    const service = new ChatService();
    const roomId = createRoom(service, ['user-1']);

    const result = service.shareCodeSnippet({
      roomId,
      senderId: 'user-1',
      content: 'Shared a Rust snippet',
      code: 'fn main() { println!("hi"); }',
      language: 'rust',
      title: 'Hello World',
    });

    expect(result).toMatchObject({
      roomId,
      senderId: 'user-1',
      content: 'Shared a Rust snippet',
      codeSnippet: {
        code: 'fn main() { println!("hi"); }',
        language: 'rust',
        title: 'Hello World',
      },
    });

    const roomMessages = service.findMessagesByRoom(roomId);
    expect(roomMessages.items).toHaveLength(1);
    expect(roomMessages.items[0].codeSnippet).toEqual({
      code: 'fn main() { println!("hi"); }',
      language: 'rust',
      title: 'Hello World',
    });
  });
});

describe('ChatService authorization (#655)', () => {
  it('rejects messages for a room that does not exist', () => {
    const service = new ChatService();
    expect(() =>
      service.createMessage({
        roomId: 'missing-room',
        senderId: 'user-1',
        content: 'hi',
      }),
    ).toThrow(NotFoundException);
  });

  it('rejects messages from a sender who is not a room participant', () => {
    const service = new ChatService();
    const roomId = createRoom(service, ['alice']);

    expect(() =>
      service.createMessage({
        roomId,
        senderId: 'mallory',
        content: 'hi',
      }),
    ).toThrow(ForbiddenException);
  });

  it('rejects code snippets from a sender who is not a room participant', () => {
    const service = new ChatService();
    const roomId = createRoom(service, ['alice']);

    expect(() =>
      service.shareCodeSnippet({
        roomId,
        senderId: 'mallory',
        content: 'snippet',
        code: 'fn main() {}',
        language: 'rust',
      }),
    ).toThrow(ForbiddenException);
  });

  it('rejects reading messages for a room that does not exist', () => {
    const service = new ChatService();
    expect(() => service.findMessagesByRoom('missing-room')).toThrow(
      NotFoundException,
    );
  });

  it('allows participants to post to a room', () => {
    const service = new ChatService();
    const roomId = createRoom(service, ['alice', 'bob']);

    const msg = service.createMessage({
      roomId,
      senderId: 'bob',
      content: 'hello alice',
    });
    expect(msg.senderId).toBe('bob');
  });
});

describe('ChatService pagination (#655)', () => {
  it('pages messages with a stable cursor', () => {
    const service = new ChatService();
    const roomId = createRoom(service, ['user-1']);
    for (let i = 0; i < 5; i++) {
      service.createMessage({ roomId, senderId: 'user-1', content: `msg-${i}` });
    }

    const page1 = service.findMessagesByRoom(roomId, { limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeDefined();

    const page2 = service.findMessagesByRoom(roomId, {
      limit: 2,
      cursor: page1.nextCursor,
    });
    expect(page2.items).toHaveLength(2);
    expect(page2.nextCursor).toBeDefined();

    const page3 = service.findMessagesByRoom(roomId, {
      limit: 2,
      cursor: page2.nextCursor,
    });
    expect(page3.items).toHaveLength(1);
    expect(page3.nextCursor).toBeUndefined();
  });

  it('pages rooms newest first', () => {
    const service = new ChatService();
    createRoom(service, ['u1'], 'room-a');
    createRoom(service, ['u2'], 'room-b');
    createRoom(service, ['u3'], 'room-c');

    const page1 = service.findAllRooms({ limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeDefined();

    const page2 = service.findAllRooms({ limit: 2, cursor: page1.nextCursor });
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeUndefined();
  });
});

describe('ChatService bounded storage (#655)', () => {
  it('evicts the oldest messages once a room exceeds its bound', () => {
    const repository = new InMemoryChatRepository({
      maxRooms: 10,
      maxMessagesPerRoom: 3,
      roomTtlMs: 60_000,
      messageTtlMs: 60_000,
    });
    const service = new ChatService(undefined, repository);
    const roomId = createRoom(service, ['user-1']);

    for (let i = 0; i < 5; i++) {
      service.createMessage({ roomId, senderId: 'user-1', content: `msg-${i}` });
    }

    const { items } = service.findMessagesByRoom(roomId);
    expect(items).toHaveLength(3);
    // Oldest messages were evicted first.
    expect(items.map((m) => m.content)).toEqual(['msg-2', 'msg-3', 'msg-4']);
  });

  it('evicts the oldest room (and its messages) once the room bound is exceeded', () => {
    const repository = new InMemoryChatRepository({
      maxRooms: 2,
      maxMessagesPerRoom: 10,
      roomTtlMs: 60_000,
      messageTtlMs: 60_000,
    });
    const service = new ChatService(undefined, repository);

    const room1 = createRoom(service, ['u1'], 'room-1');
    service.createMessage({ roomId: room1, senderId: 'u1', content: 'hi' });
    const room2 = createRoom(service, ['u2'], 'room-2');
    const room3 = createRoom(service, ['u3'], 'room-3');

    expect(service.findRoomById(room1)).toBeUndefined();
    expect(service.findRoomById(room2)).toBeDefined();
    expect(service.findRoomById(room3)).toBeDefined();
    // Messages of the evicted room are gone too.
    expect(repository.messageCount).toBe(0);
  });

  it('prunes messages and rooms past their retention window', () => {
    const repository = new InMemoryChatRepository({
      maxRooms: 10,
      maxMessagesPerRoom: 10,
      roomTtlMs: 1_000,
      messageTtlMs: 1_000,
    });
    const service = new ChatService(undefined, repository);
    const roomId = createRoom(service, ['user-1']);
    service.createMessage({ roomId, senderId: 'user-1', content: 'hi' });

    // A "now" far in the future expires everything.
    service.pruneExpired(new Date(Date.now() + 60_000));

    expect(repository.messageCount).toBe(0);
    expect(repository.roomCount).toBe(0);
    expect(service.findRoomById(roomId)).toBeUndefined();
  });
});
