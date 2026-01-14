/**
 * Social Service
 * Phase 8: Ecosystem Expansion - User profiles, follows, comments, and activity feed
 */

import { randomBytes } from "crypto";
import {
  UserProfile,
  UserStats,
  UserPreferences,
  Badge,
  Follow,
  Comment,
  Activity,
  ActivityType,
  LeaderboardEntry,
  UpdateProfileRequest,
  CreateCommentRequest,
  CommentFilterOptions,
  ActivityFilterOptions,
} from "./types";
import { auditLogger } from "../security/audit-logger";

/**
 * Default user stats
 */
const DEFAULT_STATS: UserStats = {
  campaignsCreated: 0,
  campaignsSuccessful: 0,
  campaignsCancelled: 0,
  totalRaised: BigInt(0),
  totalBackers: 0,
  creatorSuccessRate: 0,
  campaignsBacked: 0,
  totalPledged: BigInt(0),
  commemorativesEarned: 0,
  disputesRaised: 0,
  disputesWon: 0,
  followers: 0,
  following: 0,
  commentsPosted: 0,
  likesReceived: 0,
};

/**
 * Default user preferences
 */
const DEFAULT_PREFERENCES: UserPreferences = {
  emailNotifications: true,
  pushNotifications: true,
  publicProfile: true,
  showPledgeAmounts: false,
  showBackedCampaigns: true,
};

/**
 * Social Service
 * Manages user profiles, social graph, comments, and activity feeds
 */
export class SocialService {
  private profiles: Map<string, UserProfile> = new Map();
  private follows: Map<string, Follow> = new Map();
  private comments: Map<string, Comment> = new Map();
  private activities: Activity[] = [];
  private badges: Map<string, Badge> = new Map();

  // ============================================================================
  // USER PROFILES
  // ============================================================================

  /**
   * Get or create user profile
   */
  getProfile(address: string): UserProfile {
    const normalizedAddress = address.toLowerCase();
    let profile = this.profiles.get(normalizedAddress);

    if (!profile) {
      profile = this.createDefaultProfile(normalizedAddress);
      this.profiles.set(normalizedAddress, profile);
    }

    return profile;
  }

  /**
   * Create default profile for new user
   */
  private createDefaultProfile(address: string): UserProfile {
    return {
      address,
      socialLinks: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
      verified: false,
      badges: [],
      stats: { ...DEFAULT_STATS },
      preferences: { ...DEFAULT_PREFERENCES },
    };
  }

  /**
   * Update user profile
   */
  updateProfile(address: string, updates: UpdateProfileRequest): UserProfile {
    const normalizedAddress = address.toLowerCase();
    const profile = this.getProfile(normalizedAddress);

    if (updates.name !== undefined) profile.name = updates.name;
    if (updates.displayName !== undefined) profile.displayName = updates.displayName;
    if (updates.avatar !== undefined) profile.avatar = updates.avatar;
    if (updates.bio !== undefined) profile.bio = updates.bio;
    if (updates.websiteUrl !== undefined) profile.websiteUrl = updates.websiteUrl;
    if (updates.socialLinks) {
      profile.socialLinks = { ...profile.socialLinks, ...updates.socialLinks };
    }
    if (updates.preferences) {
      profile.preferences = { ...profile.preferences, ...updates.preferences };
    }

    profile.updatedAt = Date.now();
    this.profiles.set(normalizedAddress, profile);

    auditLogger.success(
      "profile_updated",
      { type: "user", address: normalizedAddress },
      { type: "profile", id: normalizedAddress },
      { updates: Object.keys(updates) }
    );

    return profile;
  }

  /**
   * Update user stats
   */
  updateStats(address: string, updates: Partial<UserStats>): void {
    const normalizedAddress = address.toLowerCase();
    const profile = this.getProfile(normalizedAddress);

    profile.stats = { ...profile.stats, ...updates };

    // Recalculate success rate
    if (profile.stats.campaignsCreated > 0) {
      profile.stats.creatorSuccessRate =
        (profile.stats.campaignsSuccessful / profile.stats.campaignsCreated) * 100;
    }

    profile.updatedAt = Date.now();
    this.profiles.set(normalizedAddress, profile);
  }

  /**
   * Search profiles
   */
  searchProfiles(query: string, limit: number = 20): UserProfile[] {
    const lowerQuery = query.toLowerCase();

    return Array.from(this.profiles.values())
      .filter(
        (p) =>
          p.preferences.publicProfile &&
          (p.address.includes(lowerQuery) ||
            p.name?.toLowerCase().includes(lowerQuery) ||
            p.displayName?.toLowerCase().includes(lowerQuery))
      )
      .slice(0, limit);
  }

  // ============================================================================
  // FOLLOWS
  // ============================================================================

  /**
   * Follow a user
   */
  follow(follower: string, following: string): Follow {
    const normalizedFollower = follower.toLowerCase();
    const normalizedFollowing = following.toLowerCase();

    if (normalizedFollower === normalizedFollowing) {
      throw new Error("Cannot follow yourself");
    }

    const key = `${normalizedFollower}:${normalizedFollowing}`;

    if (this.follows.has(key)) {
      throw new Error("Already following this user");
    }

    const follow: Follow = {
      id: `follow-${randomBytes(8).toString("hex")}`,
      follower: normalizedFollower,
      following: normalizedFollowing,
      createdAt: Date.now(),
      notificationsEnabled: true,
    };

    this.follows.set(key, follow);

    // Update stats
    this.updateStats(normalizedFollower, {
      following: (this.getProfile(normalizedFollower).stats.following || 0) + 1,
    });
    this.updateStats(normalizedFollowing, {
      followers: (this.getProfile(normalizedFollowing).stats.followers || 0) + 1,
    });

    // Create activity
    this.createActivity({
      type: "follow_added",
      actor: normalizedFollower,
      data: { targetUser: normalizedFollowing },
      visibility: "public",
    });

    return follow;
  }

  /**
   * Unfollow a user
   */
  unfollow(follower: string, following: string): boolean {
    const normalizedFollower = follower.toLowerCase();
    const normalizedFollowing = following.toLowerCase();

    const key = `${normalizedFollower}:${normalizedFollowing}`;
    const existed = this.follows.delete(key);

    if (existed) {
      // Update stats
      this.updateStats(normalizedFollower, {
        following: Math.max(0, (this.getProfile(normalizedFollower).stats.following || 0) - 1),
      });
      this.updateStats(normalizedFollowing, {
        followers: Math.max(0, (this.getProfile(normalizedFollowing).stats.followers || 0) - 1),
      });
    }

    return existed;
  }

  /**
   * Check if user is following another
   */
  isFollowing(follower: string, following: string): boolean {
    const key = `${follower.toLowerCase()}:${following.toLowerCase()}`;
    return this.follows.has(key);
  }

  /**
   * Get followers of a user
   */
  getFollowers(address: string, limit: number = 50): UserProfile[] {
    const normalizedAddress = address.toLowerCase();

    const followerAddresses = Array.from(this.follows.values())
      .filter((f) => f.following === normalizedAddress)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((f) => f.follower);

    return followerAddresses.map((addr) => this.getProfile(addr));
  }

  /**
   * Get users that a user is following
   */
  getFollowing(address: string, limit: number = 50): UserProfile[] {
    const normalizedAddress = address.toLowerCase();

    const followingAddresses = Array.from(this.follows.values())
      .filter((f) => f.follower === normalizedAddress)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((f) => f.following);

    return followingAddresses.map((addr) => this.getProfile(addr));
  }

  // ============================================================================
  // COMMENTS
  // ============================================================================

  /**
   * Create a comment
   */
  createComment(author: string, request: CreateCommentRequest): Comment {
    const normalizedAuthor = author.toLowerCase();

    // Validate content
    if (!request.content || request.content.trim().length === 0) {
      throw new Error("Comment content cannot be empty");
    }

    if (request.content.length > 5000) {
      throw new Error("Comment content exceeds maximum length (5000 characters)");
    }

    // If reply, verify parent exists
    if (request.parentId) {
      const parent = this.comments.get(request.parentId);
      if (!parent) {
        throw new Error("Parent comment not found");
      }
      if (parent.campaignId !== request.campaignId) {
        throw new Error("Parent comment is from a different campaign");
      }
    }

    const comment: Comment = {
      id: `comment-${randomBytes(8).toString("hex")}`,
      campaignId: request.campaignId,
      author: normalizedAuthor,
      content: request.content.trim(),
      createdAt: Date.now(),
      parentId: request.parentId,
      likes: 0,
      likedBy: [],
      reported: false,
      hidden: false,
      pinned: false,
    };

    this.comments.set(comment.id, comment);

    // Update stats
    this.updateStats(normalizedAuthor, {
      commentsPosted: (this.getProfile(normalizedAuthor).stats.commentsPosted || 0) + 1,
    });

    // Create activity
    this.createActivity({
      type: "comment_posted",
      actor: normalizedAuthor,
      data: {
        campaignId: request.campaignId,
        commentId: comment.id,
        commentPreview: request.content.slice(0, 100),
      },
      visibility: "public",
    });

    return comment;
  }

  /**
   * Get comment by ID
   */
  getComment(commentId: string): Comment | undefined {
    return this.comments.get(commentId);
  }

  /**
   * Update comment
   */
  updateComment(commentId: string, author: string, content: string): Comment {
    const comment = this.comments.get(commentId);

    if (!comment) {
      throw new Error("Comment not found");
    }

    if (comment.author !== author.toLowerCase()) {
      throw new Error("Not authorized to edit this comment");
    }

    if (!content || content.trim().length === 0) {
      throw new Error("Comment content cannot be empty");
    }

    comment.content = content.trim();
    comment.updatedAt = Date.now();
    comment.editedAt = Date.now();

    return comment;
  }

  /**
   * Delete comment
   */
  deleteComment(commentId: string, author: string, isAdmin: boolean = false): boolean {
    const comment = this.comments.get(commentId);

    if (!comment) {
      return false;
    }

    if (!isAdmin && comment.author !== author.toLowerCase()) {
      throw new Error("Not authorized to delete this comment");
    }

    this.comments.delete(commentId);
    return true;
  }

  /**
   * Like a comment
   */
  likeComment(commentId: string, liker: string): Comment {
    const comment = this.comments.get(commentId);

    if (!comment) {
      throw new Error("Comment not found");
    }

    const normalizedLiker = liker.toLowerCase();

    if (comment.likedBy.includes(normalizedLiker)) {
      throw new Error("Already liked this comment");
    }

    comment.likedBy.push(normalizedLiker);
    comment.likes++;

    // Update author's stats
    this.updateStats(comment.author, {
      likesReceived: (this.getProfile(comment.author).stats.likesReceived || 0) + 1,
    });

    return comment;
  }

  /**
   * Unlike a comment
   */
  unlikeComment(commentId: string, liker: string): Comment {
    const comment = this.comments.get(commentId);

    if (!comment) {
      throw new Error("Comment not found");
    }

    const normalizedLiker = liker.toLowerCase();
    const index = comment.likedBy.indexOf(normalizedLiker);

    if (index === -1) {
      throw new Error("Have not liked this comment");
    }

    comment.likedBy.splice(index, 1);
    comment.likes--;

    return comment;
  }

  /**
   * List comments with filters
   */
  listComments(options: CommentFilterOptions): Comment[] {
    let comments = Array.from(this.comments.values());

    if (options.campaignId) {
      comments = comments.filter((c) => c.campaignId === options.campaignId);
    }

    if (options.author) {
      comments = comments.filter((c) => c.author === options.author.toLowerCase());
    }

    if (options.parentId !== undefined) {
      comments = comments.filter((c) => c.parentId === options.parentId);
    }

    if (!options.includeHidden) {
      comments = comments.filter((c) => !c.hidden);
    }

    // Sort
    switch (options.sortBy) {
      case "popular":
        comments.sort((a, b) => b.likes - a.likes);
        break;
      case "oldest":
        comments.sort((a, b) => a.createdAt - b.createdAt);
        break;
      case "recent":
      default:
        comments.sort((a, b) => b.createdAt - a.createdAt);
    }

    // Pagination
    const offset = options.offset || 0;
    const limit = options.limit || 50;

    return comments.slice(offset, offset + limit);
  }

  /**
   * Get comment count for a campaign
   */
  getCommentCount(campaignId: string): number {
    return Array.from(this.comments.values()).filter(
      (c) => c.campaignId === campaignId && !c.hidden
    ).length;
  }

  /**
   * Pin/unpin comment
   */
  pinComment(commentId: string, pinned: boolean): Comment {
    const comment = this.comments.get(commentId);
    if (!comment) {
      throw new Error("Comment not found");
    }
    comment.pinned = pinned;
    return comment;
  }

  /**
   * Report comment
   */
  reportComment(commentId: string, reporter: string, reason: string): void {
    const comment = this.comments.get(commentId);
    if (!comment) {
      throw new Error("Comment not found");
    }
    comment.reported = true;

    auditLogger.log(
      "comment_reported",
      { type: "user", address: reporter },
      { type: "comment", id: commentId },
      { reason },
      "success"
    );
  }

  // ============================================================================
  // ACTIVITY FEED
  // ============================================================================

  /**
   * Create activity entry
   */
  createActivity(
    params: Omit<Activity, "id" | "timestamp">
  ): Activity {
    const activity: Activity = {
      id: `activity-${randomBytes(8).toString("hex")}`,
      timestamp: Date.now(),
      ...params,
    };

    this.activities.push(activity);

    // Keep only last 100000 activities
    if (this.activities.length > 100000) {
      this.activities = this.activities.slice(-100000);
    }

    return activity;
  }

  /**
   * Get activity feed for a user (their own activities)
   */
  getUserActivity(address: string, options?: ActivityFilterOptions): Activity[] {
    const normalizedAddress = address.toLowerCase();

    return this.filterActivities({
      ...options,
      actor: normalizedAddress,
    });
  }

  /**
   * Get feed for a user (activities from followed users)
   */
  getFeed(address: string, limit: number = 50): Activity[] {
    const normalizedAddress = address.toLowerCase();

    // Get followed users
    const followingAddresses = Array.from(this.follows.values())
      .filter((f) => f.follower === normalizedAddress)
      .map((f) => f.following);

    // Include own activities
    followingAddresses.push(normalizedAddress);

    // Get activities from followed users
    return this.activities
      .filter(
        (a) =>
          followingAddresses.includes(a.actor) &&
          (a.visibility === "public" ||
            (a.visibility === "followers" && followingAddresses.includes(a.actor)))
      )
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Get global activity feed
   */
  getGlobalFeed(limit: number = 50): Activity[] {
    return this.activities
      .filter((a) => a.visibility === "public")
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Filter activities
   */
  private filterActivities(options?: ActivityFilterOptions): Activity[] {
    let activities = this.activities;

    if (options?.actor) {
      activities = activities.filter((a) => a.actor === options.actor);
    }

    if (options?.types && options.types.length > 0) {
      activities = activities.filter((a) => options.types!.includes(a.type));
    }

    if (options?.since) {
      activities = activities.filter((a) => a.timestamp >= options.since!);
    }

    if (options?.until) {
      activities = activities.filter((a) => a.timestamp <= options.until!);
    }

    // Sort by timestamp descending
    activities = activities.sort((a, b) => b.timestamp - a.timestamp);

    // Pagination
    const offset = options?.offset || 0;
    const limit = options?.limit || 50;

    return activities.slice(offset, offset + limit);
  }

  // ============================================================================
  // BADGES
  // ============================================================================

  /**
   * Award badge to user
   */
  awardBadge(address: string, badge: Omit<Badge, "earnedAt">): Badge {
    const normalizedAddress = address.toLowerCase();
    const profile = this.getProfile(normalizedAddress);

    const fullBadge: Badge = {
      ...badge,
      earnedAt: Date.now(),
    };

    // Check if already has badge
    if (profile.badges.some((b) => b.id === badge.id)) {
      throw new Error("User already has this badge");
    }

    profile.badges.push(fullBadge);

    // Create activity
    this.createActivity({
      type: "badge_earned",
      actor: normalizedAddress,
      data: { badgeId: badge.id, badgeName: badge.name },
      visibility: "public",
    });

    return fullBadge;
  }

  /**
   * Get available badges
   */
  getAvailableBadges(): Badge[] {
    return Array.from(this.badges.values());
  }

  // ============================================================================
  // LEADERBOARDS
  // ============================================================================

  /**
   * Get creator leaderboard
   */
  getCreatorLeaderboard(
    metric: "raised" | "campaigns" | "backers" | "success_rate",
    period: "all_time" | "monthly" | "weekly" = "all_time",
    limit: number = 50
  ): LeaderboardEntry[] {
    let profiles = Array.from(this.profiles.values()).filter(
      (p) => p.stats.campaignsCreated > 0
    );

    // Sort by metric
    switch (metric) {
      case "raised":
        profiles.sort((a, b) => Number(b.stats.totalRaised - a.stats.totalRaised));
        break;
      case "campaigns":
        profiles.sort((a, b) => b.stats.campaignsSuccessful - a.stats.campaignsSuccessful);
        break;
      case "backers":
        profiles.sort((a, b) => b.stats.totalBackers - a.stats.totalBackers);
        break;
      case "success_rate":
        profiles.sort((a, b) => b.stats.creatorSuccessRate - a.stats.creatorSuccessRate);
        break;
    }

    return profiles.slice(0, limit).map((profile, index) => ({
      rank: index + 1,
      address: profile.address,
      profile,
      score:
        metric === "raised"
          ? Number(profile.stats.totalRaised)
          : metric === "campaigns"
          ? profile.stats.campaignsSuccessful
          : metric === "backers"
          ? profile.stats.totalBackers
          : profile.stats.creatorSuccessRate,
      metric,
      period,
    }));
  }

  /**
   * Get backer leaderboard
   */
  getBackerLeaderboard(
    metric: "pledged" | "campaigns" | "commemoratives",
    limit: number = 50
  ): LeaderboardEntry[] {
    let profiles = Array.from(this.profiles.values()).filter(
      (p) => p.stats.campaignsBacked > 0
    );

    switch (metric) {
      case "pledged":
        profiles.sort((a, b) => Number(b.stats.totalPledged - a.stats.totalPledged));
        break;
      case "campaigns":
        profiles.sort((a, b) => b.stats.campaignsBacked - a.stats.campaignsBacked);
        break;
      case "commemoratives":
        profiles.sort((a, b) => b.stats.commemorativesEarned - a.stats.commemorativesEarned);
        break;
    }

    return profiles.slice(0, limit).map((profile, index) => ({
      rank: index + 1,
      address: profile.address,
      profile,
      score:
        metric === "pledged"
          ? Number(profile.stats.totalPledged)
          : metric === "campaigns"
          ? profile.stats.campaignsBacked
          : profile.stats.commemorativesEarned,
      metric,
      period: "all_time",
    }));
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get social statistics
   */
  getStatistics(): {
    totalProfiles: number;
    totalFollows: number;
    totalComments: number;
    totalActivities: number;
    verifiedProfiles: number;
  } {
    return {
      totalProfiles: this.profiles.size,
      totalFollows: this.follows.size,
      totalComments: this.comments.size,
      totalActivities: this.activities.length,
      verifiedProfiles: Array.from(this.profiles.values()).filter((p) => p.verified).length,
    };
  }
}

// Export singleton instance
export const socialService = new SocialService();
