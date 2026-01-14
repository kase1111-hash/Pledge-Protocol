/**
 * Social API Routes
 * Phase 8: Ecosystem Expansion - User profiles, follows, comments, and activity
 */

import { Router, Request, Response } from "express";
import { socialService } from "../../social";
import { authMiddleware, requirePermission } from "../../security/middleware";
import { auditLogger } from "../../security/audit-logger";

const router = Router();

// ============================================================================
// USER PROFILES
// ============================================================================

/**
 * GET /social/users/:address
 * Get user profile
 */
router.get("/users/:address", (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const profile = socialService.getProfile(address);

    // Check privacy settings
    if (!profile.preferences.publicProfile && req.auth?.address !== address.toLowerCase()) {
      res.status(403).json({
        success: false,
        error: "This profile is private",
      });
      return;
    }

    // Remove sensitive data if not owner
    if (req.auth?.address !== address.toLowerCase()) {
      const publicProfile = {
        ...profile,
        preferences: undefined,
        stats: profile.preferences.showPledgeAmounts
          ? profile.stats
          : {
              ...profile.stats,
              totalPledged: undefined,
              totalRaised: undefined,
            },
      };

      res.json({
        success: true,
        data: publicProfile,
      });
      return;
    }

    res.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * PUT /social/users/me
 * Update own profile
 */
router.put("/users/me", authMiddleware(), (req: Request, res: Response) => {
  try {
    const profile = socialService.updateProfile(req.auth!.address, req.body);

    res.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /social/users/search
 * Search user profiles
 */
router.get("/users/search", (req: Request, res: Response) => {
  try {
    const { q, limit } = req.query;

    if (!q || typeof q !== "string") {
      res.status(400).json({
        success: false,
        error: "Search query is required",
      });
      return;
    }

    const profiles = socialService.searchProfiles(q, limit ? parseInt(limit as string) : 20);

    res.json({
      success: true,
      data: profiles,
      count: profiles.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// ============================================================================
// FOLLOWS
// ============================================================================

/**
 * POST /social/users/:address/follow
 * Follow a user
 */
router.post("/users/:address/follow", authMiddleware(), (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const follow = socialService.follow(req.auth!.address, address);

    res.status(201).json({
      success: true,
      data: follow,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * DELETE /social/users/:address/follow
 * Unfollow a user
 */
router.delete("/users/:address/follow", authMiddleware(), (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const unfollowed = socialService.unfollow(req.auth!.address, address);

    res.json({
      success: true,
      unfollowed,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /social/users/:address/following
 * Check if authenticated user is following
 */
router.get(
  "/users/:address/is-following",
  authMiddleware({ required: false }),
  (req: Request, res: Response) => {
    try {
      const { address } = req.params;

      if (!req.auth) {
        res.json({
          success: true,
          data: { isFollowing: false },
        });
        return;
      }

      const isFollowing = socialService.isFollowing(req.auth.address, address);

      res.json({
        success: true,
        data: { isFollowing },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
);

/**
 * GET /social/users/:address/followers
 * Get followers of a user
 */
router.get("/users/:address/followers", (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { limit } = req.query;

    const followers = socialService.getFollowers(address, limit ? parseInt(limit as string) : 50);

    res.json({
      success: true,
      data: followers,
      count: followers.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /social/users/:address/following
 * Get users that a user is following
 */
router.get("/users/:address/following", (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { limit } = req.query;

    const following = socialService.getFollowing(address, limit ? parseInt(limit as string) : 50);

    res.json({
      success: true,
      data: following,
      count: following.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// ============================================================================
// COMMENTS
// ============================================================================

/**
 * POST /social/campaigns/:campaignId/comments
 * Create a comment on a campaign
 */
router.post(
  "/campaigns/:campaignId/comments",
  authMiddleware(),
  (req: Request, res: Response) => {
    try {
      const { campaignId } = req.params;
      const { content, parentId } = req.body;

      const comment = socialService.createComment(req.auth!.address, {
        campaignId,
        content,
        parentId,
      });

      res.status(201).json({
        success: true,
        data: comment,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
);

/**
 * GET /social/campaigns/:campaignId/comments
 * Get comments for a campaign
 */
router.get("/campaigns/:campaignId/comments", (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { parentId, sortBy, limit, offset } = req.query;

    const comments = socialService.listComments({
      campaignId,
      parentId: parentId === "null" ? null : (parentId as string),
      sortBy: sortBy as any,
      limit: limit ? parseInt(limit as string) : 50,
      offset: offset ? parseInt(offset as string) : 0,
    });

    const total = socialService.getCommentCount(campaignId);

    res.json({
      success: true,
      data: comments,
      count: comments.length,
      total,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * PUT /social/comments/:commentId
 * Update a comment
 */
router.put("/comments/:commentId", authMiddleware(), (req: Request, res: Response) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body;

    const comment = socialService.updateComment(commentId, req.auth!.address, content);

    res.json({
      success: true,
      data: comment,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * DELETE /social/comments/:commentId
 * Delete a comment
 */
router.delete("/comments/:commentId", authMiddleware(), (req: Request, res: Response) => {
  try {
    const { commentId } = req.params;
    const isAdmin = req.auth!.roles.includes("admin");

    const deleted = socialService.deleteComment(commentId, req.auth!.address, isAdmin);

    res.json({
      success: true,
      deleted,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /social/comments/:commentId/like
 * Like a comment
 */
router.post("/comments/:commentId/like", authMiddleware(), (req: Request, res: Response) => {
  try {
    const { commentId } = req.params;
    const comment = socialService.likeComment(commentId, req.auth!.address);

    res.json({
      success: true,
      data: { likes: comment.likes },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * DELETE /social/comments/:commentId/like
 * Unlike a comment
 */
router.delete("/comments/:commentId/like", authMiddleware(), (req: Request, res: Response) => {
  try {
    const { commentId } = req.params;
    const comment = socialService.unlikeComment(commentId, req.auth!.address);

    res.json({
      success: true,
      data: { likes: comment.likes },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /social/comments/:commentId/report
 * Report a comment
 */
router.post("/comments/:commentId/report", authMiddleware(), (req: Request, res: Response) => {
  try {
    const { commentId } = req.params;
    const { reason } = req.body;

    socialService.reportComment(commentId, req.auth!.address, reason);

    res.json({
      success: true,
      message: "Comment reported",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /social/comments/:commentId/pin
 * Pin/unpin a comment (admin only)
 */
router.post(
  "/comments/:commentId/pin",
  authMiddleware(),
  requirePermission("admin:system"),
  (req: Request, res: Response) => {
    try {
      const { commentId } = req.params;
      const { pinned } = req.body;

      const comment = socialService.pinComment(commentId, pinned !== false);

      res.json({
        success: true,
        data: comment,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
);

// ============================================================================
// ACTIVITY FEED
// ============================================================================

/**
 * GET /social/feed
 * Get personalized activity feed for authenticated user
 */
router.get("/feed", authMiddleware(), (req: Request, res: Response) => {
  try {
    const { limit } = req.query;
    const feed = socialService.getFeed(req.auth!.address, limit ? parseInt(limit as string) : 50);

    res.json({
      success: true,
      data: feed,
      count: feed.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /social/feed/global
 * Get global activity feed
 */
router.get("/feed/global", (req: Request, res: Response) => {
  try {
    const { limit } = req.query;
    const feed = socialService.getGlobalFeed(limit ? parseInt(limit as string) : 50);

    res.json({
      success: true,
      data: feed,
      count: feed.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /social/users/:address/activity
 * Get activity for a specific user
 */
router.get("/users/:address/activity", (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { types, limit, offset } = req.query;

    const activity = socialService.getUserActivity(address, {
      types: types ? (types as string).split(",") as any : undefined,
      limit: limit ? parseInt(limit as string) : 50,
      offset: offset ? parseInt(offset as string) : 0,
    });

    res.json({
      success: true,
      data: activity,
      count: activity.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// ============================================================================
// LEADERBOARDS
// ============================================================================

/**
 * GET /social/leaderboard/creators
 * Get creator leaderboard
 */
router.get("/leaderboard/creators", (req: Request, res: Response) => {
  try {
    const { metric, period, limit } = req.query;

    const leaderboard = socialService.getCreatorLeaderboard(
      (metric as any) || "raised",
      (period as any) || "all_time",
      limit ? parseInt(limit as string) : 50
    );

    res.json({
      success: true,
      data: leaderboard,
      count: leaderboard.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /social/leaderboard/backers
 * Get backer leaderboard
 */
router.get("/leaderboard/backers", (req: Request, res: Response) => {
  try {
    const { metric, limit } = req.query;

    const leaderboard = socialService.getBackerLeaderboard(
      (metric as any) || "pledged",
      limit ? parseInt(limit as string) : 50
    );

    res.json({
      success: true,
      data: leaderboard,
      count: leaderboard.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * GET /social/stats
 * Get social system statistics
 */
router.get("/stats", (req: Request, res: Response) => {
  try {
    const stats = socialService.getStatistics();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

export default router;
