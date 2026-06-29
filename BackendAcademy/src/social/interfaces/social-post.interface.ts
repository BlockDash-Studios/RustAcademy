export type ModerationStatus = 'pending' | 'approved' | 'rejected' | 'flagged';

export interface SocialPost {
  id: string;
  userId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  moderationStatus: ModerationStatus;
  moderatedBy?: string;
  moderatedAt?: Date;
  moderationReason?: string;
  likes: number;
  comments: number;
  reposts: number;
}

export interface CreateSocialPostDto {
  userId: string;
  content: string;
}

export interface ModerationActionDto {
  postId: string;
  moderatorId: string;
  status: ModerationStatus;
  reason?: string;
}

export interface FollowResponse {
  followerId: string;
  targetUserId: string;
  followersCount: number;
  followingCount: number;
}

export interface SocialFeedResponse {
  posts: SocialPost[];
  total: number;
  page: number;
  limit: number;
}