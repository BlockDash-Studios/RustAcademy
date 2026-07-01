export { SocialController } from './social.controller';
export { SocialModule } from './social.module';
export { SocialService } from './social.service';
export { CreateSocialPostDto } from './dto/create-social-post.dto';
export { GetSocialFeedDto } from './dto/get-social-feed.dto';
export { UpdateModerationDto } from './dto/update-moderation.dto';
export { HashtagSearchDto } from './dto/hashtag-search.dto';
export type {
  FollowResponse,
  ModerationStatus,
  SocialFeedResponse,
  SocialPost,
} from './interfaces/social-post.interface';
export type {
  Hashtag,
  HashtagListResponse,
  HashtagQueryParams,
} from './interfaces/hashtag.interface';
