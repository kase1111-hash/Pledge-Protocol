/**
 * Analytics Dashboard API Routes
 * Phase 6: Governance - Creator and backer analytics
 */

import { Router, Request, Response } from "express";
import { ensureSearchIndexFresh, indexEntriesFor, searchService } from "../../discovery";
import { campaignsById, campaignsCreatedBy, pledgesByBacker } from "../../database";
import { disputeService } from "../../governance";
import { notificationService } from "../../notifications";
import { commemorativeService } from "../../tokens";
import { asyncHandler, authMiddleware, requireSelfOrAdmin } from "../../security/middleware";

const router = Router();

// ============================================================================
// CREATOR ANALYTICS
// ============================================================================

/**
 * GET /analytics/creators/:address/dashboard
 * Get creator dashboard overview
 */
router.get("/creators/:address/dashboard", authMiddleware(), requireSelfOrAdmin(), asyncHandler(async (req: Request, res: Response) => {
  try {
    const { address } = req.params;

    // Get creator's campaigns
    const campaigns = await indexEntriesFor(await campaignsCreatedBy(address));

    // Calculate metrics
    let totalPledged = BigInt(0);
    let totalBackers = 0;
    let activeCampaigns = 0;
    let resolvedCampaigns = 0;
    let totalMilestones = 0;
    let completedMilestones = 0;

    for (const campaign of campaigns) {
      totalPledged += campaign.totalPledged;
      totalBackers += campaign.backerCount;

      if (campaign.status === "active") activeCampaigns++;
      if (campaign.status === "resolved") resolvedCampaigns++;

      totalMilestones += campaign.milestoneCount;
      completedMilestones += campaign.completedMilestones;
    }

    // Get disputes
    const disputes = disputeService.listDisputes({ raisedBy: address });

    // Get notifications
    const notifications = notificationService.getNotifications({
      recipient: address,
      status: ["pending", "delivered"],
    });
    const unreadCount = notificationService.getUnreadCount(address);

    res.json({
      success: true,
      data: {
        overview: {
          totalCampaigns: campaigns.length,
          activeCampaigns,
          resolvedCampaigns,
          totalPledged: totalPledged.toString(),
          totalBackers,
          successRate:
            campaigns.length > 0
              ? ((resolvedCampaigns / campaigns.length) * 100).toFixed(1)
              : "0",
        },
        milestones: {
          total: totalMilestones,
          completed: completedMilestones,
          completionRate:
            totalMilestones > 0
              ? ((completedMilestones / totalMilestones) * 100).toFixed(1)
              : "0",
        },
        disputes: {
          total: disputes.length,
          active: disputes.filter((d) => d.status !== "closed" && d.status !== "resolved").length,
        },
        notifications: {
          unread: unreadCount,
          recent: notifications.slice(0, 5),
        },
        recentCampaigns: campaigns.slice(0, 5).map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          totalPledged: c.totalPledged.toString(),
          backerCount: c.backerCount,
          createdAt: c.createdAt,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
}));

/**
 * GET /analytics/creators/:address/campaigns
 * Get detailed campaign analytics for creator
 */
router.get("/creators/:address/campaigns", authMiddleware(), requireSelfOrAdmin(), asyncHandler(async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const campaigns = await indexEntriesFor(await campaignsCreatedBy(address));

    const campaignAnalytics = campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      category: campaign.category,
      status: campaign.status,
      createdAt: campaign.createdAt,
      deadline: campaign.deadline,
      resolvedAt: campaign.resolvedAt,
      metrics: {
        totalPledged: campaign.totalPledged.toString(),
        goalAmount: campaign.goalAmount?.toString(),
        goalProgress: campaign.goalAmount
          ? ((Number(campaign.totalPledged) / Number(campaign.goalAmount)) * 100).toFixed(1)
          : null,
        backerCount: campaign.backerCount,
        pledgeCount: campaign.pledgeCount,
        viewCount: campaign.viewCount,
        shareCount: campaign.shareCount,
      },
      milestones: {
        total: campaign.milestoneCount,
        completed: campaign.completedMilestones,
        completionRate:
          campaign.milestoneCount > 0
            ? ((campaign.completedMilestones / campaign.milestoneCount) * 100).toFixed(1)
            : "0",
      },
      engagement: {
        trendingScore: campaign.trendingScore,
        isFeatured: !!campaign.featuredAt,
      },
    }));

    res.json({
      success: true,
      data: campaignAnalytics,
      count: campaignAnalytics.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
}));

/**
 * GET /analytics/creators/:address/performance
 * Get creator performance over time
 */
router.get("/creators/:address/performance", authMiddleware(), requireSelfOrAdmin(), asyncHandler(async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const campaigns = await indexEntriesFor(await campaignsCreatedBy(address));

    // Group by month
    const monthlyData: Record<
      string,
      {
        month: string;
        campaignsCreated: number;
        campaignsResolved: number;
        totalPledged: bigint;
        totalBackers: number;
      }
    > = {};

    for (const campaign of campaigns) {
      const date = new Date(campaign.createdAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthKey,
          campaignsCreated: 0,
          campaignsResolved: 0,
          totalPledged: BigInt(0),
          totalBackers: 0,
        };
      }

      monthlyData[monthKey].campaignsCreated++;
      monthlyData[monthKey].totalPledged += campaign.totalPledged;
      monthlyData[monthKey].totalBackers += campaign.backerCount;

      if (campaign.status === "resolved" && campaign.resolvedAt) {
        const resolvedDate = new Date(campaign.resolvedAt);
        const resolvedMonthKey = `${resolvedDate.getFullYear()}-${String(resolvedDate.getMonth() + 1).padStart(2, "0")}`;
        if (monthlyData[resolvedMonthKey]) {
          monthlyData[resolvedMonthKey].campaignsResolved++;
        }
      }
    }

    const performance = Object.values(monthlyData)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((m) => ({
        ...m,
        totalPledged: m.totalPledged.toString(),
      }));

    res.json({
      success: true,
      data: performance,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
}));

// ============================================================================
// BACKER ANALYTICS
// ============================================================================

/**
 * A backer's pledges with their campaigns' discovery entries
 */
async function backerPledges(address: string) {
  const pledges = (await pledgesByBacker(address)).sort((a, b) => b.createdAt - a.createdAt);
  const campaigns = await campaignsById(pledges.map((p) => p.campaignId));
  const entries = new Map(
    (await indexEntriesFor(Array.from(campaigns.values()))).map((entry) => [entry.id, entry])
  );

  let totalPledged = 0n;
  let totalReleased = 0n;
  let totalRefunded = 0n;
  let pendingResolution = 0n;
  const byStatus = { active: 0, resolved: 0, refunded: 0, cancelled: 0 };

  for (const pledge of pledges) {
    byStatus[pledge.status]++;
    totalRefunded += BigInt(pledge.refundedAmount ?? "0");
    if (pledge.status === "cancelled") continue;
    totalPledged += BigInt(pledge.escrowedAmount);
    totalReleased += BigInt(pledge.finalAmount ?? "0");
    if (pledge.status === "active") pendingResolution += BigInt(pledge.escrowedAmount);
  }

  return { pledges, campaigns, entries, totalPledged, totalReleased, totalRefunded, pendingResolution, byStatus };
}

/**
 * GET /analytics/backers/:address/dashboard
 * Get backer dashboard overview
 */
router.get("/backers/:address/dashboard", authMiddleware(), requireSelfOrAdmin(), asyncHandler(async (req: Request, res: Response) => {
  const { address } = req.params;
  const data = await backerPledges(address);

  const notifications = notificationService.getNotifications({
    recipient: address,
    status: ["pending", "delivered"],
  });
  const unreadCount = notificationService.getUnreadCount(address);

  const now = new Date();
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000;
  const supported = new Set(
    data.pledges.filter((p) => p.status !== "cancelled").map((p) => p.campaignId)
  );

  res.json({
    success: true,
    data: {
      portfolio: {
        totalPledged: data.totalPledged.toString(),
        totalReleased: data.totalReleased.toString(),
        totalRefunded: data.totalRefunded.toString(),
        activePledges: data.byStatus.active,
        resolvedPledges: data.byStatus.resolved + data.byStatus.refunded,
        commemorativesOwned: commemorativeService.getByBackerAddress(address).length,
      },
      notifications: {
        unread: unreadCount,
        recent: notifications.slice(0, 5),
      },
      activity: {
        pledgesThisMonth: data.pledges.filter((p) => p.createdAt >= monthStart).length,
        campaignsSupported: supported.size,
        categoriesExplored: Array.from(
          new Set(Array.from(supported).map((id) => data.entries.get(id)?.category).filter(Boolean))
        ),
      },
    },
  });
}));

/**
 * GET /analytics/backers/:address/portfolio
 * Get backer portfolio analytics
 */
router.get("/backers/:address/portfolio", authMiddleware(), requireSelfOrAdmin(), asyncHandler(async (req: Request, res: Response) => {
  const { address } = req.params;
  const data = await backerPledges(address);
  const counted = data.pledges.filter((p) => p.status !== "cancelled");

  const pledgesByCategory: Record<string, number> = {
    fitness: 0,
    education: 0,
    creative: 0,
    opensource: 0,
    business: 0,
    research: 0,
    personal: 0,
    other: 0,
  };
  const byBeneficiary = new Map<string, { address: string; name: string; amount: bigint; pledges: number }>();
  for (const pledge of counted) {
    pledgesByCategory[data.entries.get(pledge.campaignId)?.category ?? "other"]++;

    const campaign = data.campaigns.get(pledge.campaignId);
    if (!campaign) continue;
    const key = campaign.beneficiary.toLowerCase();
    const entry = byBeneficiary.get(key) ?? {
      address: campaign.beneficiary,
      name: campaign.beneficiaryName,
      amount: 0n,
      pledges: 0,
    };
    entry.amount += BigInt(pledge.escrowedAmount);
    entry.pledges++;
    byBeneficiary.set(key, entry);
  }

  // Share of resolved pledges that released anything to the beneficiary
  const settled = counted.filter((p) => p.status !== "active");
  const succeeded = settled.filter((p) => BigInt(p.finalAmount ?? "0") > 0n).length;

  res.json({
    success: true,
    data: {
      summary: {
        totalValue: (data.totalPledged - data.totalRefunded).toString(),
        totalPledged: data.totalPledged.toString(),
        totalReleased: data.totalReleased.toString(),
        totalRefunded: data.totalRefunded.toString(),
        pendingResolution: data.pendingResolution.toString(),
      },
      pledgesByStatus: data.byStatus,
      pledgesByCategory,
      successRate: settled.length > 0 ? ((succeeded / settled.length) * 100).toFixed(1) : "0",
      averagePledgeAmount:
        counted.length > 0 ? (data.totalPledged / BigInt(counted.length)).toString() : "0",
      topBeneficiaries: Array.from(byBeneficiary.values())
        .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0))
        .slice(0, 5)
        .map((b) => ({ ...b, amount: b.amount.toString() })),
      recentPledges: data.pledges.slice(0, 5).map((p) => ({
        id: p.id,
        campaignId: p.campaignId,
        campaignName: data.campaigns.get(p.campaignId)?.name ?? null,
        amount: p.escrowedAmount,
        status: p.status,
        createdAt: p.createdAt,
      })),
    },
  });
}));

// ============================================================================
// PLATFORM ANALYTICS
// ============================================================================

/**
 * GET /analytics/platform/overview
 * Get platform-wide analytics
 */
router.get("/platform/overview", asyncHandler(async (_req: Request, res: Response) => {
  await ensureSearchIndexFresh();
  try {
    const searchStats = searchService.getStatistics();
    const disputeStats = disputeService.getStatistics();
    const notificationStats = notificationService.getStatistics();

    res.json({
      success: true,
      data: {
        campaigns: {
          total: searchStats.totalCampaigns,
          active: searchStats.activeCampaigns,
          byStatus: searchStats.byStatus,
          byCategory: searchStats.byCategory,
        },
        funding: {
          totalPledged: searchStats.totalPledged,
          totalBackers: searchStats.totalBackers,
        },
        disputes: {
          total: disputeStats.total,
          byStatus: disputeStats.byStatus,
          byCategory: disputeStats.byCategory,
          averageResolutionTime: disputeStats.averageResolutionTime,
        },
        notifications: {
          total: notificationStats.totalNotifications,
          webhookCount: notificationStats.webhookCount,
          deliverySuccessRate: notificationStats.deliverySuccessRate,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
}));

/**
 * GET /analytics/platform/trending
 * Get trending metrics
 */
router.get("/platform/trending", asyncHandler(async (req: Request, res: Response) => {
  await ensureSearchIndexFresh();
  try {
    const limit = parseInt(req.query.limit as string) || 10;

    const trendingCampaigns = searchService.getTrending(limit);
    const featuredCampaigns = searchService.getFeatured(6);
    const endingSoon = searchService.getEndingSoon(7, limit);
    const recentlyResolved = searchService.getRecentlyResolved(limit);

    res.json({
      success: true,
      data: {
        trending: trendingCampaigns.map((t) => ({
          campaign: {
            id: t.campaign.id,
            name: t.campaign.name,
            category: t.campaign.category,
            totalPledged: t.campaign.totalPledged.toString(),
            backerCount: t.campaign.backerCount,
          },
          trendingReason: t.trendingReason,
          changePercent: t.changePercent,
          timeFrame: t.timeFrame,
        })),
        featured: featuredCampaigns.map((c) => ({
          id: c.id,
          name: c.name,
          category: c.category,
          totalPledged: c.totalPledged.toString(),
          backerCount: c.backerCount,
          featuredAt: c.featuredAt,
        })),
        endingSoon: endingSoon.map((c) => ({
          id: c.id,
          name: c.name,
          deadline: c.deadline,
          totalPledged: c.totalPledged.toString(),
          goalAmount: c.goalAmount?.toString(),
        })),
        recentlyResolved: recentlyResolved.map((c) => ({
          id: c.id,
          name: c.name,
          resolvedAt: c.resolvedAt,
          totalPledged: c.totalPledged.toString(),
          completedMilestones: c.completedMilestones,
          milestoneCount: c.milestoneCount,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
}));

// ============================================================================
// SEARCH & DISCOVERY
// ============================================================================

/**
 * GET /analytics/search
 * Search campaigns
 */
router.get("/search", asyncHandler(async (req: Request, res: Response) => {
  await ensureSearchIndexFresh();
  try {
    const {
      q,
      category,
      status,
      oracleType,
      tags,
      minPledged,
      maxPledged,
      minBackers,
      sort,
      order,
      page,
      limit,
    } = req.query;

    const result = searchService.search({
      filters: {
        query: q as string,
        category: category as any,
        status: status as any,
        oracleType: oracleType as string,
        tags: tags ? (tags as string).split(",") : undefined,
        minPledged: minPledged ? BigInt(minPledged as string) : undefined,
        maxPledged: maxPledged ? BigInt(maxPledged as string) : undefined,
        minBackers: minBackers ? parseInt(minBackers as string) : undefined,
      },
      sort: sort
        ? {
            field: sort as any,
            order: (order as any) || "desc",
          }
        : undefined,
      pagination: {
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 20,
      },
    });

    res.json({
      success: true,
      data: {
        campaigns: result.campaigns.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description.slice(0, 200),
          category: c.category,
          status: c.status,
          totalPledged: c.totalPledged.toString(),
          goalAmount: c.goalAmount?.toString(),
          backerCount: c.backerCount,
          deadline: c.deadline,
          tags: c.tags,
          trendingScore: c.trendingScore,
        })),
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        },
        facets: result.facets,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
}));

/**
 * GET /analytics/campaigns/:campaignId/similar
 * Get similar campaigns
 */
router.get("/campaigns/:campaignId/similar", asyncHandler(async (req: Request, res: Response) => {
  await ensureSearchIndexFresh();
  try {
    const { campaignId } = req.params;
    const limit = parseInt(req.query.limit as string) || 5;

    const similar = searchService.getSimilar(campaignId, limit);

    res.json({
      success: true,
      data: similar.map((s) => ({
        campaign: {
          id: s.campaign.id,
          name: s.campaign.name,
          category: s.campaign.category,
          totalPledged: s.campaign.totalPledged.toString(),
          backerCount: s.campaign.backerCount,
        },
        similarityScore: s.similarityScore,
        matchedOn: s.matchedOn,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
}));

export default router;
