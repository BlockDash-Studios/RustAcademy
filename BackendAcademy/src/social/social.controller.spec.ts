import { SocialController } from './social.controller';
import { SocialService } from './social.service';

describe('SocialController', () => {
  let controller: SocialController;
  let service: SocialService;

  beforeEach(() => {
    service = new SocialService();
    controller = new SocialController(service);
  });

  it('should return the same feed from discovery alias', () => {
    const post = service.createPost('user-1', { content: 'Hello #rust' });
    service.moderatePost(post.id, 'moderator-1', { status: 'approved' });

    const feed = controller.getFeed({});
    const discovery = controller.getDiscovery({});

    expect(discovery).toEqual(feed);
    expect(discovery.posts[0].id).toBe(post.id);
  });
});
