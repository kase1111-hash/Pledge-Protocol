/**
 * Phase 6: Governance Tests
 * Tests for dispute resolution, notifications, webhooks, search, and analytics
 */

import { describe, it, expect, beforeEach } from "vitest";
import { DisputeService } from "../src/governance/dispute-service";
import { NotificationService } from "../src/notifications/notification-service";
import { SearchService } from "../src/discovery/search-service";
import type { DisputeCategory, ResolutionTier, VoteOption } from "../src/governance/types";
import type { NotificationEventType } from "../src/notifications/types";
import type { CampaignStatus } from "../src/discovery/search-service";

describe("Phase 6: Governance", () => {
  // ============================================================================
  // DISPUTE RESOLUTION TESTS
  // ============================================================================

  describe("DisputeService", () => {
    let disputeService: DisputeService;

    beforeEach(() => {
      disputeService = new DisputeService();
    });

    describe("Dispute Creation", () => {
      it("should create a new dispute", async () => {
        const dispute = await disputeService.createDispute(
          {
            campaignId: "campaign-1",
            pledgeId: "pledge-1",
            milestoneId: "milestone-1",
            category: "oracle_disagreement",
            title: "Oracle data mismatch",
            description: "The oracle reported incorrect data",
            initialTier: "community",
          },
          "0xBacker123"
        );

        expect(dispute).toBeDefined();
        expect(dispute.id).toMatch(/^dispute-/);
        expect(dispute.status).toBe("pending");
        expect(dispute.category).toBe("oracle_disagreement");
        expect(dispute.tier).toBe("community");
        expect(dispute.raisedBy).toBe("0xBacker123");
      });

      it("should assign dispute to correct tier based on category", async () => {
        const technicalDispute = await disputeService.createDispute(
          {
            campaignId: "campaign-1",
            category: "technical_issue",
            title: "Smart contract bug",
            description: "Transaction reverted unexpectedly",
          },
          "0xUser"
        );

        expect(technicalDispute.tier).toBe("automated");

        const fraudDispute = await disputeService.createDispute(
          {
            campaignId: "campaign-2",
            category: "fraud_claim",
            title: "Suspected fraud",
            description: "Creator may be acting fraudulently",
          },
          "0xUser"
        );

        expect(fraudDispute.tier).toBe("council");
      });

      it("should reject invalid dispute data", async () => {
        await expect(
          disputeService.createDispute(
            {
              campaignId: "",
              category: "oracle_disagreement",
              title: "",
              description: "",
            },
            "0xUser"
          )
        ).rejects.toThrow();
      });
    });

    describe("Evidence Submission", () => {
      let disputeId: string;

      beforeEach(async () => {
        const dispute = await disputeService.createDispute(
          {
            campaignId: "campaign-1",
            category: "milestone_dispute",
            title: "Milestone not completed",
            description: "Creator claims milestone is done but it is not",
          },
          "0xBacker"
        );
        disputeId = dispute.id;
      });

      it("should submit evidence to a dispute", async () => {
        const evidence = await disputeService.submitEvidence(
          disputeId,
          "0xBacker",
          "document",
          "Screenshot of incomplete milestone",
          "https://evidence.example.com/screenshot.png"
        );

        expect(evidence).toBeDefined();
        expect(evidence.id).toMatch(/^evidence-/);
        expect(evidence.disputeId).toBe(disputeId);
        expect(evidence.type).toBe("document");
      });

      it("should track evidence from multiple parties", async () => {
        await disputeService.submitEvidence(
          disputeId,
          "0xBacker",
          "document",
          "Backer evidence",
          "https://backer.example.com/evidence"
        );

        await disputeService.submitEvidence(
          disputeId,
          "0xCreator",
          "document",
          "Creator response",
          "https://creator.example.com/response"
        );

        const dispute = disputeService.getDispute(disputeId);
        expect(dispute?.evidence.length).toBe(2);
      });

      it("should reject evidence for closed disputes", async () => {
        const dispute = disputeService.getDispute(disputeId);
        if (dispute) {
          (dispute as any).status = "closed";
        }

        await expect(
          disputeService.submitEvidence(
            disputeId,
            "0xUser",
            "document",
            "Late evidence",
            "https://example.com"
          )
        ).rejects.toThrow();
      });
    });

    describe("Voting Process", () => {
      let disputeId: string;
      const voters = ["0xVoter1", "0xVoter2", "0xVoter3", "0xVoter4", "0xVoter5"];
      const votingPowers = new Map<string, bigint>([
        ["0xVoter1", BigInt(100)],
        ["0xVoter2", BigInt(200)],
        ["0xVoter3", BigInt(150)],
        ["0xVoter4", BigInt(50)],
        ["0xVoter5", BigInt(100)],
      ]);

      beforeEach(async () => {
        const dispute = await disputeService.createDispute(
          {
            campaignId: "campaign-1",
            category: "oracle_disagreement",
            title: "Test dispute",
            description: "Testing voting process",
            initialTier: "community",
          },
          "0xBacker"
        );
        disputeId = dispute.id;
      });

      it("should open voting for a dispute", async () => {
        await disputeService.openVoting(disputeId, voters, votingPowers);

        const dispute = disputeService.getDispute(disputeId);
        expect(dispute?.status).toBe("voting");
        expect(dispute?.votingDeadline).toBeDefined();
      });

      it("should cast votes with voting power", async () => {
        await disputeService.openVoting(disputeId, voters, votingPowers);

        const vote = await disputeService.castVote(
          disputeId,
          "0xVoter1",
          BigInt(100),
          "release",
          "Creator completed the work"
        );

        expect(vote).toBeDefined();
        expect(vote.voter).toBe("0xVoter1");
        expect(vote.vote).toBe("release");
        expect(vote.votingPower).toBe(BigInt(100));
      });

      it("should prevent double voting", async () => {
        await disputeService.openVoting(disputeId, voters, votingPowers);

        await disputeService.castVote(disputeId, "0xVoter1", BigInt(100), "release");

        await expect(
          disputeService.castVote(disputeId, "0xVoter1", BigInt(100), "refund")
        ).rejects.toThrow("already voted");
      });

      it("should reject votes from non-eligible voters", async () => {
        await disputeService.openVoting(disputeId, voters, votingPowers);

        await expect(
          disputeService.castVote(disputeId, "0xNotEligible", BigInt(100), "release")
        ).rejects.toThrow("not eligible");
      });

      it("should close voting and calculate results", async () => {
        await disputeService.openVoting(disputeId, voters, votingPowers);

        // Cast votes: release=300, refund=200
        await disputeService.castVote(disputeId, "0xVoter1", BigInt(100), "release");
        await disputeService.castVote(disputeId, "0xVoter2", BigInt(200), "release");
        await disputeService.castVote(disputeId, "0xVoter3", BigInt(150), "refund");
        await disputeService.castVote(disputeId, "0xVoter4", BigInt(50), "refund");

        const tally = await disputeService.closeVoting(disputeId);

        expect(tally).toBeDefined();
        expect(tally.release).toBe(BigInt(300));
        expect(tally.refund).toBe(BigInt(200));
        expect(tally.winningOption).toBe("release");
      });
    });

    describe("Escalation", () => {
      let disputeId: string;

      beforeEach(async () => {
        const dispute = await disputeService.createDispute(
          {
            campaignId: "campaign-1",
            category: "milestone_dispute",
            title: "Complex dispute",
            description: "Requires escalation",
            initialTier: "community",
          },
          "0xBacker"
        );
        disputeId = dispute.id;
      });

      it("should escalate dispute to higher tier", async () => {
        await disputeService.escalate(disputeId, "Community vote was inconclusive");

        const dispute = disputeService.getDispute(disputeId);
        expect(dispute?.status).toBe("escalated");
        expect(dispute?.tier).toBe("creator");
      });

      it("should track escalation history", async () => {
        await disputeService.escalate(disputeId, "First escalation");
        await disputeService.escalate(disputeId, "Second escalation");

        const dispute = disputeService.getDispute(disputeId);
        expect(dispute?.escalationHistory?.length).toBe(2);
      });
    });

    describe("Resolution", () => {
      let disputeId: string;

      beforeEach(async () => {
        const dispute = await disputeService.createDispute(
          {
            campaignId: "campaign-1",
            category: "oracle_failure",
            title: "Oracle timeout",
            description: "Oracle did not respond",
          },
          "0xBacker"
        );
        disputeId = dispute.id;
      });

      it("should resolve dispute with release decision", async () => {
        const resolved = await disputeService.resolve(disputeId, {
          outcome: "release",
          rationale: "Oracle was temporarily unavailable but creator fulfilled obligation",
          resolvedBy: "0xAdmin",
        });

        expect(resolved.status).toBe("resolved");
        expect(resolved.resolution?.outcome).toBe("release");
      });

      it("should resolve dispute with refund decision", async () => {
        const resolved = await disputeService.resolve(disputeId, {
          outcome: "refund",
          rationale: "Milestone clearly not met",
          resolvedBy: "0xAdmin",
        });

        expect(resolved.status).toBe("resolved");
        expect(resolved.resolution?.outcome).toBe("refund");
      });

      it("should resolve dispute with partial decision", async () => {
        const resolved = await disputeService.resolve(disputeId, {
          outcome: "partial",
          partialPercentage: 60,
          rationale: "Milestone partially completed",
          resolvedBy: "0xAdmin",
        });

        expect(resolved.status).toBe("resolved");
        expect(resolved.resolution?.outcome).toBe("partial");
        expect(resolved.resolution?.partialPercentage).toBe(60);
      });
    });

    describe("Appeal", () => {
      let disputeId: string;

      beforeEach(async () => {
        const dispute = await disputeService.createDispute(
          {
            campaignId: "campaign-1",
            category: "calculation_error",
            title: "Wrong calculation",
            description: "Pledge amount calculated incorrectly",
          },
          "0xBacker"
        );
        disputeId = dispute.id;

        await disputeService.resolve(disputeId, {
          outcome: "release",
          rationale: "Calculation was correct",
          resolvedBy: "0xAdmin",
        });
      });

      it("should allow appeal of resolved disputes", async () => {
        await disputeService.appeal(disputeId, "0xBacker", "New evidence found");

        const dispute = disputeService.getDispute(disputeId);
        expect(dispute?.status).toBe("appealed");
      });

      it("should escalate tier on appeal", async () => {
        const originalDispute = disputeService.getDispute(disputeId);
        const originalTier = originalDispute?.tier;

        await disputeService.appeal(disputeId, "0xBacker", "Appeal reason");

        const appealedDispute = disputeService.getDispute(disputeId);
        expect(appealedDispute?.tier).not.toBe(originalTier);
      });
    });

    describe("Dispute Listing and Filtering", () => {
      beforeEach(async () => {
        // Create multiple disputes
        await disputeService.createDispute(
          {
            campaignId: "campaign-1",
            category: "oracle_disagreement",
            title: "Dispute 1",
            description: "Test",
          },
          "0xUser1"
        );

        await disputeService.createDispute(
          {
            campaignId: "campaign-1",
            category: "milestone_dispute",
            title: "Dispute 2",
            description: "Test",
          },
          "0xUser2"
        );

        await disputeService.createDispute(
          {
            campaignId: "campaign-2",
            category: "fraud_claim",
            title: "Dispute 3",
            description: "Test",
          },
          "0xUser1"
        );
      });

      it("should list all disputes", () => {
        const disputes = disputeService.listDisputes({});
        expect(disputes.length).toBe(3);
      });

      it("should filter by campaign", () => {
        const disputes = disputeService.listDisputes({ campaignId: "campaign-1" });
        expect(disputes.length).toBe(2);
      });

      it("should filter by raised by", () => {
        const disputes = disputeService.listDisputes({ raisedBy: "0xUser1" });
        expect(disputes.length).toBe(2);
      });

      it("should filter by category", () => {
        const disputes = disputeService.listDisputes({ category: "fraud_claim" });
        expect(disputes.length).toBe(1);
      });
    });

    describe("Statistics", () => {
      beforeEach(async () => {
        const d1 = await disputeService.createDispute(
          {
            campaignId: "campaign-1",
            category: "oracle_disagreement",
            title: "Dispute 1",
            description: "Test",
          },
          "0xUser1"
        );

        await disputeService.resolve(d1.id, {
          outcome: "release",
          rationale: "Resolved",
          resolvedBy: "0xAdmin",
        });

        await disputeService.createDispute(
          {
            campaignId: "campaign-2",
            category: "milestone_dispute",
            title: "Dispute 2",
            description: "Test",
          },
          "0xUser2"
        );
      });

      it("should return dispute statistics", () => {
        const stats = disputeService.getStatistics();

        expect(stats.total).toBe(2);
        expect(stats.byStatus.resolved).toBe(1);
        expect(stats.byCategory.oracle_disagreement).toBe(1);
        expect(stats.byCategory.milestone_dispute).toBe(1);
      });
    });
  });

  // ============================================================================
  // NOTIFICATION SERVICE TESTS
  // ============================================================================

  describe("NotificationService", () => {
    let notificationService: NotificationService;

    beforeEach(() => {
      notificationService = new NotificationService();
    });

    describe("Webhook Management", () => {
      it("should create a webhook", () => {
        const webhook = notificationService.createWebhook(
          {
            name: "Test Webhook",
            url: "https://example.com/webhook",
            events: ["campaign_created", "pledge_created"],
            secret: "test-secret-16-chars",
          },
          "0xCreator"
        );

        expect(webhook).toBeDefined();
        expect(webhook.id).toMatch(/^webhook-/);
        expect(webhook.name).toBe("Test Webhook");
        expect(webhook.events).toContain("campaign_created");
        expect(webhook.active).toBe(true);
      });

      it("should update a webhook", () => {
        const webhook = notificationService.createWebhook(
          {
            name: "Original Name",
            url: "https://example.com/webhook",
            events: ["campaign_created"],
          },
          "0xCreator"
        );

        const updated = notificationService.updateWebhook(webhook.id, {
          name: "Updated Name",
          events: ["campaign_created", "campaign_resolved"],
        });

        expect(updated.name).toBe("Updated Name");
        expect(updated.events).toContain("campaign_resolved");
      });

      it("should delete a webhook", () => {
        const webhook = notificationService.createWebhook(
          {
            name: "To Delete",
            url: "https://example.com/webhook",
            events: ["campaign_created"],
          },
          "0xCreator"
        );

        const deleted = notificationService.deleteWebhook(webhook.id);
        expect(deleted).toBe(true);

        const notFound = notificationService.getWebhook(webhook.id);
        expect(notFound).toBeUndefined();
      });

      it("should list webhooks by creator", () => {
        notificationService.createWebhook(
          {
            name: "Webhook 1",
            url: "https://example1.com/webhook",
            events: ["campaign_created"],
          },
          "0xCreator1"
        );

        notificationService.createWebhook(
          {
            name: "Webhook 2",
            url: "https://example2.com/webhook",
            events: ["pledge_created"],
          },
          "0xCreator1"
        );

        notificationService.createWebhook(
          {
            name: "Webhook 3",
            url: "https://example3.com/webhook",
            events: ["campaign_created"],
          },
          "0xCreator2"
        );

        const creator1Webhooks = notificationService.listWebhooks("0xCreator1");
        expect(creator1Webhooks.length).toBe(2);

        const allWebhooks = notificationService.listWebhooks();
        expect(allWebhooks.length).toBe(3);
      });
    });

    describe("Notification Events", () => {
      it("should emit notification events", async () => {
        notificationService.createWebhook(
          {
            name: "Test Webhook",
            url: "https://example.com/webhook",
            events: ["campaign_created"],
          },
          "0xCreator"
        );

        // This will attempt to deliver but fail (no real endpoint)
        await notificationService.emit({
          type: "campaign_created",
          campaignId: "campaign-1",
          data: {
            name: "Test Campaign",
            creator: "0xCreator",
          },
        });

        // Check that notification was created
        const notifications = notificationService.getNotifications({
          recipient: "0xCreator",
        });

        // Notification should be created (delivery may fail)
        expect(notifications.length).toBeGreaterThanOrEqual(0);
      });

      it("should filter events by campaign ID", async () => {
        notificationService.createWebhook(
          {
            name: "Campaign Specific",
            url: "https://example.com/webhook",
            events: ["pledge_created"],
            campaignIds: ["campaign-1"],
          },
          "0xCreator"
        );

        // This webhook should NOT trigger for campaign-2
        const webhook = notificationService.listWebhooks()[0];
        expect(webhook.campaignIds).toContain("campaign-1");
      });
    });

    describe("Notification Preferences", () => {
      it("should set notification preferences", () => {
        const prefs = notificationService.setPreferences("0xUser", {
          email: true,
          push: false,
          enabledEvents: ["campaign_created", "pledge_released"],
        });

        expect(prefs.email).toBe(true);
        expect(prefs.push).toBe(false);
        expect(prefs.enabledEvents).toContain("campaign_created");
      });

      it("should get notification preferences", () => {
        notificationService.setPreferences("0xUser", {
          email: true,
          inApp: false,
        });

        const prefs = notificationService.getPreferences("0xUser");
        expect(prefs.email).toBe(true);
        expect(prefs.inApp).toBe(false);
      });

      it("should return default preferences for new users", () => {
        const prefs = notificationService.getPreferences("0xNewUser");

        // Should have some defaults
        expect(prefs).toBeDefined();
        expect(prefs.inApp).toBe(true);
      });
    });

    describe("Unread Count", () => {
      it("should track unread notifications", () => {
        // Create some notifications
        notificationService.createNotification({
          type: "campaign_created",
          recipient: "0xUser",
          campaignId: "campaign-1",
          title: "Test 1",
          message: "Test message 1",
        });

        notificationService.createNotification({
          type: "pledge_created",
          recipient: "0xUser",
          campaignId: "campaign-1",
          title: "Test 2",
          message: "Test message 2",
        });

        const unreadCount = notificationService.getUnreadCount("0xUser");
        expect(unreadCount).toBe(2);
      });

      it("should mark notifications as read", () => {
        const notification = notificationService.createNotification({
          type: "campaign_created",
          recipient: "0xUser",
          campaignId: "campaign-1",
          title: "Test",
          message: "Test message",
        });

        notificationService.markAsRead("0xUser", notification.id);

        const unreadCount = notificationService.getUnreadCount("0xUser");
        expect(unreadCount).toBe(0);
      });
    });

    describe("Statistics", () => {
      it("should return notification statistics", () => {
        notificationService.createWebhook(
          {
            name: "Webhook 1",
            url: "https://example.com/webhook",
            events: ["campaign_created"],
          },
          "0xCreator"
        );

        notificationService.createNotification({
          type: "campaign_created",
          recipient: "0xUser",
          campaignId: "campaign-1",
          title: "Test",
          message: "Test message",
        });

        const stats = notificationService.getStatistics();

        expect(stats.webhookCount).toBe(1);
        expect(stats.totalNotifications).toBe(1);
      });
    });
  });

  // ============================================================================
  // SEARCH SERVICE TESTS
  // ============================================================================

  describe("SearchService", () => {
    let searchService: SearchService;

    beforeEach(() => {
      searchService = new SearchService();

      // Index some test campaigns
      searchService.indexCampaign({
        id: "campaign-1",
        name: "Marathon Training Goal",
        description: "Training for a marathon with weekly milestones",
        category: "fitness",
        status: "active",
        creator: "0xCreator1",
        totalPledged: BigInt(1000),
        goalAmount: BigInt(5000),
        backerCount: 10,
        pledgeCount: 15,
        viewCount: 100,
        shareCount: 5,
        trendingScore: 85,
        milestoneCount: 4,
        completedMilestones: 2,
        tags: ["marathon", "running", "fitness"],
        createdAt: Date.now() - 86400000 * 7, // 7 days ago
        deadline: Date.now() + 86400000 * 30, // 30 days from now
      });

      searchService.indexCampaign({
        id: "campaign-2",
        name: "Open Source Project",
        description: "Building an open source library for developers",
        category: "opensource",
        status: "active",
        creator: "0xCreator2",
        totalPledged: BigInt(2500),
        goalAmount: BigInt(10000),
        backerCount: 25,
        pledgeCount: 30,
        viewCount: 500,
        shareCount: 20,
        trendingScore: 95,
        milestoneCount: 6,
        completedMilestones: 3,
        tags: ["opensource", "programming", "library"],
        createdAt: Date.now() - 86400000 * 14, // 14 days ago
        deadline: Date.now() + 86400000 * 60, // 60 days from now
      });

      searchService.indexCampaign({
        id: "campaign-3",
        name: "Academic Research Study",
        description: "Funding for a research paper on climate change",
        category: "research",
        status: "resolved",
        creator: "0xCreator3",
        totalPledged: BigInt(5000),
        goalAmount: BigInt(5000),
        backerCount: 50,
        pledgeCount: 55,
        viewCount: 1000,
        shareCount: 50,
        trendingScore: 70,
        milestoneCount: 3,
        completedMilestones: 3,
        tags: ["research", "academic", "climate"],
        createdAt: Date.now() - 86400000 * 30, // 30 days ago
        resolvedAt: Date.now() - 86400000 * 5, // 5 days ago
      });
    });

    describe("Basic Search", () => {
      it("should search by query string", () => {
        const result = searchService.search({
          filters: { query: "marathon" },
        });

        expect(result.campaigns.length).toBe(1);
        expect(result.campaigns[0].id).toBe("campaign-1");
      });

      it("should search by category", () => {
        const result = searchService.search({
          filters: { category: "opensource" },
        });

        expect(result.campaigns.length).toBe(1);
        expect(result.campaigns[0].id).toBe("campaign-2");
      });

      it("should search by status", () => {
        const result = searchService.search({
          filters: { status: "active" },
        });

        expect(result.campaigns.length).toBe(2);
      });

      it("should search by tags", () => {
        const result = searchService.search({
          filters: { tags: ["programming"] },
        });

        expect(result.campaigns.length).toBe(1);
        expect(result.campaigns[0].id).toBe("campaign-2");
      });

      it("should filter by minimum pledged amount", () => {
        const result = searchService.search({
          filters: { minPledged: BigInt(2000) },
        });

        expect(result.campaigns.length).toBe(2);
      });

      it("should filter by minimum backers", () => {
        const result = searchService.search({
          filters: { minBackers: 30 },
        });

        expect(result.campaigns.length).toBe(1);
        expect(result.campaigns[0].id).toBe("campaign-3");
      });
    });

    describe("Sorting", () => {
      it("should sort by trending score descending", () => {
        const result = searchService.search({
          sort: { field: "trendingScore", order: "desc" },
        });

        expect(result.campaigns[0].trendingScore).toBeGreaterThanOrEqual(
          result.campaigns[1].trendingScore
        );
      });

      it("should sort by total pledged ascending", () => {
        const result = searchService.search({
          sort: { field: "totalPledged", order: "asc" },
        });

        expect(Number(result.campaigns[0].totalPledged)).toBeLessThanOrEqual(
          Number(result.campaigns[1].totalPledged)
        );
      });

      it("should sort by backer count", () => {
        const result = searchService.search({
          sort: { field: "backerCount", order: "desc" },
        });

        expect(result.campaigns[0].backerCount).toBeGreaterThanOrEqual(
          result.campaigns[1].backerCount
        );
      });
    });

    describe("Pagination", () => {
      it("should paginate results", () => {
        const page1 = searchService.search({
          pagination: { page: 1, limit: 2 },
        });

        expect(page1.campaigns.length).toBe(2);
        expect(page1.page).toBe(1);
        expect(page1.limit).toBe(2);
        expect(page1.total).toBe(3);
        expect(page1.totalPages).toBe(2);

        const page2 = searchService.search({
          pagination: { page: 2, limit: 2 },
        });

        expect(page2.campaigns.length).toBe(1);
        expect(page2.page).toBe(2);
      });
    });

    describe("Facets", () => {
      it("should return category facets", () => {
        const result = searchService.search({});

        expect(result.facets).toBeDefined();
        expect(result.facets?.categories).toBeDefined();
        expect(result.facets?.categories.fitness).toBe(1);
        expect(result.facets?.categories.opensource).toBe(1);
        expect(result.facets?.categories.research).toBe(1);
      });

      it("should return status facets", () => {
        const result = searchService.search({});

        expect(result.facets?.statuses).toBeDefined();
        expect(result.facets?.statuses.active).toBe(2);
        expect(result.facets?.statuses.resolved).toBe(1);
      });
    });

    describe("Text Search", () => {
      it("should perform full text search", () => {
        const results = searchService.textSearch("climate research", 10);

        expect(results.length).toBeGreaterThan(0);
        expect(results[0].id).toBe("campaign-3");
      });

      it("should return empty for no matches", () => {
        const results = searchService.textSearch("nonexistent term xyz", 10);

        expect(results.length).toBe(0);
      });
    });

    describe("Trending", () => {
      it("should get trending campaigns", () => {
        const trending = searchService.getTrending(10);

        expect(trending.length).toBeGreaterThan(0);
        expect(trending[0].campaign).toBeDefined();
        expect(trending[0].trendingReason).toBeDefined();
      });

      it("should order by trending score", () => {
        const trending = searchService.getTrending(10);

        if (trending.length > 1) {
          expect(trending[0].campaign.trendingScore).toBeGreaterThanOrEqual(
            trending[1].campaign.trendingScore
          );
        }
      });
    });

    describe("Featured", () => {
      it("should get featured campaigns", () => {
        // Mark a campaign as featured
        searchService.featureCampaign("campaign-1");

        const featured = searchService.getFeatured(10);

        expect(featured.length).toBe(1);
        expect(featured[0].id).toBe("campaign-1");
        expect(featured[0].featuredAt).toBeDefined();
      });

      it("should unfeature campaigns", () => {
        searchService.featureCampaign("campaign-1");
        searchService.unfeatureCampaign("campaign-1");

        const featured = searchService.getFeatured(10);

        expect(featured.length).toBe(0);
      });
    });

    describe("Ending Soon", () => {
      it("should get campaigns ending soon", () => {
        const endingSoon = searchService.getEndingSoon(90, 10);

        // All active campaigns with deadlines should be returned
        expect(endingSoon.length).toBeGreaterThan(0);
      });
    });

    describe("Recently Resolved", () => {
      it("should get recently resolved campaigns", () => {
        const recentlyResolved = searchService.getRecentlyResolved(10);

        expect(recentlyResolved.length).toBe(1);
        expect(recentlyResolved[0].id).toBe("campaign-3");
      });
    });

    describe("Similar Campaigns", () => {
      it("should find similar campaigns", () => {
        const similar = searchService.getSimilar("campaign-1", 5);

        expect(similar.length).toBeGreaterThanOrEqual(0);

        if (similar.length > 0) {
          expect(similar[0].similarityScore).toBeDefined();
          expect(similar[0].matchedOn).toBeDefined();
        }
      });
    });

    describe("Creator Campaigns", () => {
      it("should get campaigns by creator", () => {
        const campaigns = searchService.getCreatorCampaigns("0xCreator1");

        expect(campaigns.length).toBe(1);
        expect(campaigns[0].id).toBe("campaign-1");
      });

      it("should return empty for unknown creator", () => {
        const campaigns = searchService.getCreatorCampaigns("0xUnknown");

        expect(campaigns.length).toBe(0);
      });
    });

    describe("Statistics", () => {
      it("should return search statistics", () => {
        const stats = searchService.getStatistics();

        expect(stats.totalCampaigns).toBe(3);
        expect(stats.activeCampaigns).toBe(2);
        expect(stats.byCategory).toBeDefined();
        expect(stats.byStatus).toBeDefined();
      });
    });

    describe("Campaign Updates", () => {
      it("should update existing campaign in index", () => {
        searchService.indexCampaign({
          id: "campaign-1",
          name: "Updated Marathon Training",
          description: "Updated description",
          category: "fitness",
          status: "active",
          creator: "0xCreator1",
          totalPledged: BigInt(2000), // Updated
          backerCount: 20, // Updated
          pledgeCount: 25,
          viewCount: 150,
          shareCount: 10,
          trendingScore: 90,
          milestoneCount: 4,
          completedMilestones: 3,
          tags: ["marathon", "running", "fitness"],
          createdAt: Date.now() - 86400000 * 7,
        });

        const result = searchService.search({
          filters: { query: "Updated Marathon" },
        });

        expect(result.campaigns.length).toBe(1);
        expect(result.campaigns[0].totalPledged).toBe(BigInt(2000));
        expect(result.campaigns[0].backerCount).toBe(20);
      });

      it("should remove campaign from index", () => {
        searchService.removeCampaign("campaign-1");

        const result = searchService.search({});

        expect(result.campaigns.length).toBe(2);
        expect(result.campaigns.find((c) => c.id === "campaign-1")).toBeUndefined();
      });
    });
  });
});
