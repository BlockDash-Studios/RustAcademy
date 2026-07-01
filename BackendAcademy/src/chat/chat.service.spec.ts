import { ChatService } from './chat.service';

describe('ChatService code snippet sharing', () => {
  it('creates a shared code snippet message with metadata', () => {
    const service = new ChatService();

    const result = service.shareCodeSnippet({
      roomId: 'room-1',
      senderId: 'user-1',
      content: 'Shared a Rust snippet',
      code: 'fn main() { println!("hi"); }',
      language: 'rust',
      title: 'Hello World',
    });

    expect(result).toMatchObject({
      roomId: 'room-1',
      senderId: 'user-1',
      content: 'Shared a Rust snippet',
      codeSnippet: {
        code: 'fn main() { println!("hi"); }',
        language: 'rust',
        title: 'Hello World',
      },
    });

    const roomMessages = service.findMessagesByRoom('room-1');
    expect(roomMessages).toHaveLength(1);
    expect(roomMessages[0].codeSnippet).toEqual({
      code: 'fn main() { println!("hi"); }',
      language: 'rust',
      title: 'Hello World',
    });
  });
});
