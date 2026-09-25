import { ChatRoomService } from './chat-room.service';

describe('ChatRoomService', () => {
  let service: ChatRoomService;

  beforeEach(() => {
    service = new ChatRoomService();
  });

  it('lists rooms and returns paginated room message history with membership tracking', () => {
    const room = service.createRoom({
      name: '#rust-beginners',
      topic: 'rust-beginners',
      description: 'Beginner Rust discussion',
    });

    service.joinRoom(room.id, 'user-1');
    service.joinRoom(room.id, 'user-2');

    service.addMessage(room.id, { userId: 'user-1', content: 'first message' });
    service.addMessage(room.id, { userId: 'user-2', content: 'second message' });
    service.addMessage(room.id, { userId: 'user-1', content: 'third message' });

    const roomList = service.listRooms({ page: 1, limit: 10 });
    expect(roomList.items).toHaveLength(1);
    expect(roomList.items[0].name).toBe('#rust-beginners');
    expect(roomList.items[0].memberCount).toBe(2);

    const historyPageOne = service.getRoomHistory(room.id, { page: 1, limit: 2 });
    expect(historyPageOne.total).toBe(3);
    expect(historyPageOne.items.map((message) => message.content)).toEqual(['third message', 'second message']);

    const historyPageTwo = service.getRoomHistory(room.id, { page: 2, limit: 2 });
    expect(historyPageTwo.items.map((message) => message.content)).toEqual(['first message']);

    expect(service.leaveRoom(room.id, 'user-2')).toBe(true);
    expect(service.getRoomMembers(room.id)).toEqual(['user-1']);
  });
});
