/**
 * Social System Types
 * Phase 8: Ecosystem Expansion - User profiles, follows, comments, and activity
 */

/**
 * User profile
 */
export interface UserProfile {
  address: string;
  name?: string;
  displayName?: string;
  avatar?: string;
  bio?: string;
  websiteUrl?: string;
  socialLinks: {
    twitter?: string;
    github?: string;
    discord?: string;
    telegram?: string;
    [key: string]: string | undefined;
  };
  createdAt: number;
  updatedAt: number;
  verified: boolean;
  badges: Badge[];
  stats: UserStats;
  preferences: UserPreferences;
}

/**
 * User statistics
 */
export interface UserStats {
  // Creator stats
  campaignsCreated: number;
  campaignsSuccessful: number;
  campaignsCancelled: number;
  totalRaised: bigint;
  totalBackers: number;
  creatorSuccessRate: number;

  // Backer stats
  campaignsBacked: number;
  totalPledged: bigint;
  commemorativesEarned: number;
  disputesRaised: number;
  disputesWon: number;

  // Social stats
  followers: number;
  following: number;
  commentsPosted: number;
  likesReceived: number;
}

/**
 * User preferences
 */
export interface UserPreferences {
  emailNotifications: boolean;
  pushNotifications: boolean;
  publicProfile: boolean;
  showPledgeAmounts: boolean;
  showBackedCampaigns: boolean;
}

/**
 * User badge
 */
export interface Badge {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  earnedAt: number;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
}

/**
 * Follow relationship
 */
export interface Follow {
  id: string;
  follower: string;
  following: string;
  createdAt: number;
  notificationsEnabled: boolean;
}

/**
 * Campaign comment
 */
export interface Comment {
  id: string;
  campaignId: string;
  author: string;
  content: string;
  createdAt: number;
  updatedAt?: number;
  editedAt?: number;
  parentId?: string; // For replies
  likes: number;
  likedBy: string[];
  reported: boolean;
  hidden: boolean;
  pinned: boolean;
}

/**
 * Activity types
 */
export type ActivityType =
  | "campaign_created"
  | "campaign_backed"
  | "campaign_resolved"
  | "milestone_verified"
  | "comment_posted"
  | "commemorative_earned"
  | "badge_earned"
  | "follow_added"
  | "dispute_created"
  | "dispute_resolved";

/**
 * Activity feed entry
 */
export interface Activity {
  id: string;
  type: ActivityType;
  actor: string;
  timestamp: number;
  data: {
    campaignId?: string;
    campaignName?: string;
    pledgeId?: string;
    pledgeAmount?: bigint;
    commentId?: string;
    commentPreview?: string;
    badgeId?: string;
    badgeName?: string;
    targetUser?: string;
    disputeId?: string;
    milestoneId?: string;
    milestoneName?: string;
    [key: string]: any;
  };
  visibility: "public" | "followers" | "private";
}

/**
 * Creator leaderboard entry
 */
export interface LeaderboardEntry {
  rank: number;
  address: string;
  profile?: UserProfile;
  score: number;
  metric: string;
  period: "all_time" | "monthly" | "weekly";
}

/**
 * Update profile request
 */
export interface UpdateProfileRequest {
  name?: string;
  displayName?: string;
  avatar?: string;
  bio?: string;
  websiteUrl?: string;
  socialLinks?: UserProfile["socialLinks"];
  preferences?: Partial<UserPreferences>;
}

/**
 * Create comment request
 */
export interface CreateCommentRequest {
  campaignId: string;
  content: string;
  parentId?: string;
}

/**
 * Comment filter options
 */
export interface CommentFilterOptions {
  campaignId?: string;
  author?: string;
  parentId?: string | null;
  includeHidden?: boolean;
  sortBy?: "recent" | "popular" | "oldest";
  limit?: number;
  offset?: number;
}

/**
 * Activity filter options
 */
export interface ActivityFilterOptions {
  actor?: string;
  types?: ActivityType[];
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
}
