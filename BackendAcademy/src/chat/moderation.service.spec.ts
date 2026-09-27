import { ForbiddenException } from '@nestjs/common';
import { ModerationService } from './moderation.service';

describe('ModerationService', () => {
  it('mutes a user after repeated abusive messages and queues reports', () => {
    const service = new ModerationService();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(() => service.sendMessage({
        userId: 'user-1',
        channelId: 'room-1',
        kind: 'room',
        content: 'this is shit',
      })).toThrow(ForbiddenException);
    }

    expect(service.isMuted('user-1')).toBe(true);
    expect(() => service.sendMessage({
      userId: 'user-1',
      channelId: 'room-1',
      kind: 'room',
      content: 'hello',
    })).toThrow(ForbiddenException);

    service.report({
      reporterId: 'user-2',
      messageId: 'msg-1',
      reason: 'abuse',
      details: 'Repeated abusive language',
    });
    expect(service.getQueue()).toHaveLength(1);
  });
});
