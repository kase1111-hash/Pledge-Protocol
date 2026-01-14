/**
 * Phase 8: Ecosystem Expansion Tests
 * Tests for multi-chain, SDK, and social features
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getChainConfig,
  getEnabledChains,
  getMainnets,
  getTestnets,
  isChainSupported,
  ChainId,
  CHAIN_CONFIGS,
} from "../src/multichain/config";
import { MultiChainRegistry } from "../src/multichain/registry";
import { DeploymentService } from "../src/multichain/deployment-service";
import { SocialService } from "../src/social/social-service";
import { PledgeProtocolClient, createClient } from "../src/sdk/client";

describe("Phase 8: Ecosystem Expansion", () => {
  // ============================================================================
  // MULTI-CHAIN CONFIGURATION TESTS
  // ============================================================================

  describe("Multi-Chain Configuration", () => {
    it("should have all expected chains configured", () => {
      expect(CHAIN_CONFIGS[1]).toBeDefined(); // Ethereum
      expect(CHAIN_CONFIGS[137]).toBeDefined(); // Polygon
      expect(CHAIN_CONFIGS[42161]).toBeDefined(); // Arbitrum
      expect(CHAIN_CONFIGS[10]).toBeDefined(); // Optimism
      expect(CHAIN_CONFIGS[8453]).toBeDefined(); // Base
    });

    it("should return chain config by ID", () => {
      const config = getChainConfig(137);

      expect(config).toBeDefined();
      expect(config?.name).toBe("Polygon");
      expect(config?.nativeCurrency.symbol).toBe("MATIC");
    });

    it("should list enabled chains", () => {
      const chains = getEnabledChains();

      expect(chains.length).toBeGreaterThan(0);
      expect(chains.every((c) => c.enabled)).toBe(true);
    });

    it("should filter mainnets", () => {
      const mainnets = getMainnets();

      expect(mainnets.length).toBeGreaterThan(0);
      expect(mainnets.every((c) => c.networkType === "mainnet")).toBe(true);
    });

    it("should filter testnets", () => {
      const testnets = getTestnets();

      expect(testnets.length).toBeGreaterThan(0);
      expect(testnets.every((c) => c.networkType === "testnet")).toBe(true);
    });

    it("should validate chain support", () => {
      expect(isChainSupported(137)).toBe(true);
      expect(isChainSupported(999999)).toBe(false);
    });
  });

  // ============================================================================
  // MULTI-CHAIN REGISTRY TESTS
  // ============================================================================

  describe("MultiChainRegistry", () => {
    let registry: MultiChainRegistry;

    beforeEach(() => {
      registry = new MultiChainRegistry();
    });

    describe("Contract Registration", () => {
      it("should register core contracts", () => {
        registry.registerContract({
          contractType: "CampaignRegistry",
          chainId: 137,
          address: "0x1234567890123456789012345678901234567890",
          deployedAt: Date.now(),
          deployedBy: "0xDeployer",
          transactionHash: "0x" + "a".repeat(64),
          blockNumber: 12345,
          version: "1.0.0",
          verified: true,
        });

        const address = registry.getContractAddress(137, "CampaignRegistry");
        expect(address).toBe("0x1234567890123456789012345678901234567890");
      });

      it("should check if protocol is deployed on chain", () => {
        // Register required contracts
        registry.registerContract({
          contractType: "CampaignRegistry",
          chainId: 137,
          address: "0x1111111111111111111111111111111111111111",
          deployedAt: Date.now(),
          deployedBy: "0xDeployer",
          transactionHash: "0x" + "a".repeat(64),
          blockNumber: 1,
          version: "1.0.0",
          verified: true,
        });

        registry.registerContract({
          contractType: "EscrowVault",
          chainId: 137,
          address: "0x2222222222222222222222222222222222222222",
          deployedAt: Date.now(),
          deployedBy: "0xDeployer",
          transactionHash: "0x" + "b".repeat(64),
          blockNumber: 2,
          version: "1.0.0",
          verified: true,
        });

        registry.registerContract({
          contractType: "PledgeManager",
          chainId: 137,
          address: "0x3333333333333333333333333333333333333333",
          deployedAt: Date.now(),
          deployedBy: "0xDeployer",
          transactionHash: "0x" + "c".repeat(64),
          blockNumber: 3,
          version: "1.0.0",
          verified: true,
        });

        expect(registry.isDeployedOnChain(137)).toBe(true);
        expect(registry.isDeployedOnChain(1)).toBe(false);
      });
    });

    describe("Campaign Registration", () => {
      it("should register campaign deployment", () => {
        registry.registerCampaignDeployment({
          campaignId: "campaign-1",
          chainId: 137,
          contractAddress: "0x4444444444444444444444444444444444444444",
          escrowAddress: "0x5555555555555555555555555555555555555555",
          deployedAt: Date.now(),
          deployedBy: "0xCreator",
          transactionHash: "0x" + "d".repeat(64),
          blockNumber: 100,
          active: true,
        });

        const deployment = registry.getCampaignDeployment("campaign-1", 137);
        expect(deployment).toBeDefined();
        expect(deployment?.contractAddress).toBe("0x4444444444444444444444444444444444444444");
      });

      it("should track cross-chain deployments", () => {
        registry.registerCampaignDeployment({
          campaignId: "campaign-multi",
          chainId: 137,
          contractAddress: "0x1111111111111111111111111111111111111111",
          escrowAddress: "0x2222222222222222222222222222222222222222",
          deployedAt: Date.now() - 1000,
          deployedBy: "0xCreator",
          transactionHash: "0x" + "a".repeat(64),
          blockNumber: 1,
          active: true,
        });

        registry.registerCampaignDeployment({
          campaignId: "campaign-multi",
          chainId: 42161,
          contractAddress: "0x3333333333333333333333333333333333333333",
          escrowAddress: "0x4444444444444444444444444444444444444444",
          deployedAt: Date.now(),
          deployedBy: "0xCreator",
          transactionHash: "0x" + "b".repeat(64),
          blockNumber: 2,
          active: true,
        });

        const deployments = registry.getCampaignDeployments("campaign-multi");
        expect(deployments.length).toBe(2);

        const primaryChain = registry.getPrimaryChain("campaign-multi");
        expect(primaryChain).toBe(137); // First deployed
      });

      it("should prevent duplicate chain deployment", () => {
        registry.registerCampaignDeployment({
          campaignId: "campaign-1",
          chainId: 137,
          contractAddress: "0x1111111111111111111111111111111111111111",
          escrowAddress: "0x2222222222222222222222222222222222222222",
          deployedAt: Date.now(),
          deployedBy: "0xCreator",
          transactionHash: "0x" + "a".repeat(64),
          blockNumber: 1,
          active: true,
        });

        expect(() => {
          registry.registerCampaignDeployment({
            campaignId: "campaign-1",
            chainId: 137,
            contractAddress: "0x3333333333333333333333333333333333333333",
            escrowAddress: "0x4444444444444444444444444444444444444444",
            deployedAt: Date.now(),
            deployedBy: "0xCreator",
            transactionHash: "0x" + "b".repeat(64),
            blockNumber: 2,
            active: true,
          });
        }).toThrow("already deployed");
      });
    });

    describe("Statistics", () => {
      it("should return registry statistics", () => {
        registry.registerContract({
          contractType: "CampaignRegistry",
          chainId: 137,
          address: "0x1111111111111111111111111111111111111111",
          deployedAt: Date.now(),
          deployedBy: "0xDeployer",
          transactionHash: "0x" + "a".repeat(64),
          blockNumber: 1,
          version: "1.0.0",
          verified: true,
        });

        registry.registerCampaignDeployment({
          campaignId: "campaign-1",
          chainId: 137,
          contractAddress: "0x2222222222222222222222222222222222222222",
          escrowAddress: "0x3333333333333333333333333333333333333333",
          deployedAt: Date.now(),
          deployedBy: "0xCreator",
          transactionHash: "0x" + "b".repeat(64),
          blockNumber: 2,
          active: true,
        });

        const stats = registry.getStatistics();

        expect(stats.totalContracts).toBe(1);
        expect(stats.totalCampaigns).toBe(1);
        expect(stats.deployedChains).toBe(1);
      });
    });
  });

  // ============================================================================
  // DEPLOYMENT SERVICE TESTS
  // ============================================================================

  describe("DeploymentService", () => {
    let deploymentService: DeploymentService;

    beforeEach(() => {
      deploymentService = new DeploymentService();
    });

    it("should estimate deployment gas", async () => {
      const estimate = await deploymentService.estimateDeploymentGas(137, {
        name: "Test Campaign",
        description: "Test",
        beneficiary: "0x1234567890123456789012345678901234567890",
        goalAmount: BigInt("1000000000000000000"),
        deadline: Date.now() + 86400000,
        milestones: [{ name: "M1", targetDate: Date.now(), oracleId: "oracle-1" }],
      });

      expect(estimate).toBeDefined();
      expect(estimate.chainId).toBe(137);
      expect(estimate.gasLimit).toBeGreaterThan(BigInt(0));
      expect(estimate.nativeCurrency).toBe("MATIC");
    });

    it("should get recommended chains", () => {
      const lowCostChains = deploymentService.getRecommendedChains({ lowCost: true });

      expect(lowCostChains.length).toBeGreaterThan(0);
      // L2s should be prioritized
      const l2ChainIds = [42161, 10, 8453, 137];
      expect(l2ChainIds.includes(lowCostChains[0].chainId)).toBe(true);
    });

    it("should get fast confirmation chains", () => {
      const fastChains = deploymentService.getRecommendedChains({ fastConfirmation: true });

      expect(fastChains.length).toBeGreaterThan(0);
      // First chain should have fastest block time
      expect(fastChains[0].features.avgBlockTime).toBeLessThanOrEqual(
        fastChains[fastChains.length - 1].features.avgBlockTime
      );
    });

    it("should filter mainnet only", () => {
      const mainnets = deploymentService.getRecommendedChains({ mainnetOnly: true });

      expect(mainnets.every((c) => c.networkType === "mainnet")).toBe(true);
    });
  });

  // ============================================================================
  // SDK CLIENT TESTS
  // ============================================================================

  describe("SDK Client", () => {
    it("should create client with config", () => {
      const client = createClient({
        apiUrl: "https://api.pledgeprotocol.io",
        chainId: 137,
      });

      expect(client).toBeDefined();
      expect(client.campaigns).toBeDefined();
      expect(client.pledges).toBeDefined();
      expect(client.disputes).toBeDefined();
      expect(client.users).toBeDefined();
    });

    it("should create chain-specific client", () => {
      const client = createClient({
        apiUrl: "https://api.pledgeprotocol.io",
        chainId: 137,
      });

      const arbitrumClient = client.forChain(42161);

      expect(arbitrumClient).toBeDefined();
      expect(arbitrumClient).not.toBe(client);
    });

    it("should have all sub-clients", () => {
      const client = createClient({
        apiUrl: "https://api.pledgeprotocol.io",
      });

      expect(client.campaigns).toBeDefined();
      expect(client.pledges).toBeDefined();
      expect(client.oracles).toBeDefined();
      expect(client.disputes).toBeDefined();
      expect(client.commemoratives).toBeDefined();
      expect(client.users).toBeDefined();
      expect(client.auth).toBeDefined();
    });
  });

  // ============================================================================
  // SOCIAL SERVICE TESTS
  // ============================================================================

  describe("SocialService", () => {
    let socialService: SocialService;

    beforeEach(() => {
      socialService = new SocialService();
    });

    describe("User Profiles", () => {
      it("should create default profile for new user", () => {
        const profile = socialService.getProfile("0x1234567890123456789012345678901234567890");

        expect(profile).toBeDefined();
        expect(profile.address).toBe("0x1234567890123456789012345678901234567890");
        expect(profile.stats.campaignsCreated).toBe(0);
        expect(profile.preferences.publicProfile).toBe(true);
      });

      it("should update profile", () => {
        const address = "0x1234567890123456789012345678901234567890";

        const updated = socialService.updateProfile(address, {
          name: "Test User",
          bio: "Hello world",
          socialLinks: { twitter: "@testuser" },
        });

        expect(updated.name).toBe("Test User");
        expect(updated.bio).toBe("Hello world");
        expect(updated.socialLinks.twitter).toBe("@testuser");
      });

      it("should update user stats", () => {
        const address = "0x1234567890123456789012345678901234567890";

        socialService.updateStats(address, {
          campaignsCreated: 5,
          campaignsSuccessful: 4,
        });

        const profile = socialService.getProfile(address);

        expect(profile.stats.campaignsCreated).toBe(5);
        expect(profile.stats.campaignsSuccessful).toBe(4);
        expect(profile.stats.creatorSuccessRate).toBe(80);
      });

      it("should search profiles", () => {
        socialService.updateProfile("0x1111111111111111111111111111111111111111", {
          name: "Alice",
        });

        socialService.updateProfile("0x2222222222222222222222222222222222222222", {
          name: "Bob",
        });

        const results = socialService.searchProfiles("Alice");

        expect(results.length).toBe(1);
        expect(results[0].name).toBe("Alice");
      });
    });

    describe("Follows", () => {
      const follower = "0x1111111111111111111111111111111111111111";
      const following = "0x2222222222222222222222222222222222222222";

      it("should follow a user", () => {
        const follow = socialService.follow(follower, following);

        expect(follow).toBeDefined();
        expect(follow.follower).toBe(follower.toLowerCase());
        expect(follow.following).toBe(following.toLowerCase());
      });

      it("should check if following", () => {
        socialService.follow(follower, following);

        expect(socialService.isFollowing(follower, following)).toBe(true);
        expect(socialService.isFollowing(following, follower)).toBe(false);
      });

      it("should unfollow a user", () => {
        socialService.follow(follower, following);
        socialService.unfollow(follower, following);

        expect(socialService.isFollowing(follower, following)).toBe(false);
      });

      it("should prevent self-follow", () => {
        expect(() => socialService.follow(follower, follower)).toThrow("Cannot follow yourself");
      });

      it("should prevent duplicate follows", () => {
        socialService.follow(follower, following);

        expect(() => socialService.follow(follower, following)).toThrow("Already following");
      });

      it("should get followers and following", () => {
        const user1 = "0x1111111111111111111111111111111111111111";
        const user2 = "0x2222222222222222222222222222222222222222";
        const user3 = "0x3333333333333333333333333333333333333333";

        socialService.follow(user2, user1);
        socialService.follow(user3, user1);
        socialService.follow(user1, user2);

        const followers = socialService.getFollowers(user1);
        expect(followers.length).toBe(2);

        const followingList = socialService.getFollowing(user1);
        expect(followingList.length).toBe(1);
      });

      it("should update follower counts", () => {
        socialService.follow(follower, following);

        const followerProfile = socialService.getProfile(follower);
        const followingProfile = socialService.getProfile(following);

        expect(followerProfile.stats.following).toBe(1);
        expect(followingProfile.stats.followers).toBe(1);
      });
    });

    describe("Comments", () => {
      const author = "0x1234567890123456789012345678901234567890";
      const campaignId = "campaign-123";

      it("should create a comment", () => {
        const comment = socialService.createComment(author, {
          campaignId,
          content: "Great campaign!",
        });

        expect(comment).toBeDefined();
        expect(comment.id).toMatch(/^comment-/);
        expect(comment.content).toBe("Great campaign!");
        expect(comment.author).toBe(author.toLowerCase());
      });

      it("should create a reply", () => {
        const parent = socialService.createComment(author, {
          campaignId,
          content: "Parent comment",
        });

        const reply = socialService.createComment(author, {
          campaignId,
          content: "Reply",
          parentId: parent.id,
        });

        expect(reply.parentId).toBe(parent.id);
      });

      it("should reject empty comments", () => {
        expect(() =>
          socialService.createComment(author, {
            campaignId,
            content: "",
          })
        ).toThrow("cannot be empty");
      });

      it("should reject too long comments", () => {
        expect(() =>
          socialService.createComment(author, {
            campaignId,
            content: "x".repeat(5001),
          })
        ).toThrow("exceeds maximum length");
      });

      it("should update comment", () => {
        const comment = socialService.createComment(author, {
          campaignId,
          content: "Original",
        });

        const updated = socialService.updateComment(comment.id, author, "Updated");

        expect(updated.content).toBe("Updated");
        expect(updated.editedAt).toBeDefined();
      });

      it("should prevent unauthorized edit", () => {
        const comment = socialService.createComment(author, {
          campaignId,
          content: "Original",
        });

        expect(() =>
          socialService.updateComment(comment.id, "0x9999999999999999999999999999999999999999", "Hacked")
        ).toThrow("Not authorized");
      });

      it("should like and unlike comments", () => {
        const comment = socialService.createComment(author, {
          campaignId,
          content: "Like me!",
        });

        const liker = "0x9999999999999999999999999999999999999999";

        const liked = socialService.likeComment(comment.id, liker);
        expect(liked.likes).toBe(1);

        const unliked = socialService.unlikeComment(comment.id, liker);
        expect(unliked.likes).toBe(0);
      });

      it("should prevent double like", () => {
        const comment = socialService.createComment(author, {
          campaignId,
          content: "Like me!",
        });

        const liker = "0x9999999999999999999999999999999999999999";
        socialService.likeComment(comment.id, liker);

        expect(() => socialService.likeComment(comment.id, liker)).toThrow("Already liked");
      });

      it("should list comments with filters", () => {
        socialService.createComment(author, { campaignId, content: "Comment 1" });
        socialService.createComment(author, { campaignId, content: "Comment 2" });
        socialService.createComment(author, { campaignId: "other", content: "Other" });

        const comments = socialService.listComments({ campaignId });

        expect(comments.length).toBe(2);
      });

      it("should sort comments", () => {
        const c1 = socialService.createComment(author, { campaignId, content: "First" });

        // Wait a bit to ensure different timestamps
        const c2 = socialService.createComment(author, { campaignId, content: "Second" });

        // Like the first one
        socialService.likeComment(c1.id, "0x9999999999999999999999999999999999999999");

        const recentFirst = socialService.listComments({ campaignId, sortBy: "recent" });
        expect(recentFirst[0].id).toBe(c2.id);

        const popularFirst = socialService.listComments({ campaignId, sortBy: "popular" });
        expect(popularFirst[0].id).toBe(c1.id);
      });
    });

    describe("Activity Feed", () => {
      const user = "0x1234567890123456789012345678901234567890";

      it("should create activity", () => {
        const activity = socialService.createActivity({
          type: "campaign_created",
          actor: user,
          data: { campaignId: "camp-1", campaignName: "Test" },
          visibility: "public",
        });

        expect(activity).toBeDefined();
        expect(activity.type).toBe("campaign_created");
      });

      it("should get user activity", () => {
        socialService.createActivity({
          type: "campaign_created",
          actor: user,
          data: {},
          visibility: "public",
        });

        socialService.createActivity({
          type: "campaign_backed",
          actor: user,
          data: {},
          visibility: "public",
        });

        const activities = socialService.getUserActivity(user);

        expect(activities.length).toBe(2);
      });

      it("should get global feed", () => {
        socialService.createActivity({
          type: "campaign_created",
          actor: user,
          data: {},
          visibility: "public",
        });

        socialService.createActivity({
          type: "campaign_created",
          actor: "0x9999999999999999999999999999999999999999",
          data: {},
          visibility: "private",
        });

        const feed = socialService.getGlobalFeed();

        // Only public activities
        expect(feed.every((a) => a.visibility === "public")).toBe(true);
      });

      it("should get personalized feed", () => {
        const user1 = "0x1111111111111111111111111111111111111111";
        const user2 = "0x2222222222222222222222222222222222222222";
        const user3 = "0x3333333333333333333333333333333333333333";

        // User1 follows User2
        socialService.follow(user1, user2);

        // Create activities
        socialService.createActivity({
          type: "campaign_created",
          actor: user2,
          data: {},
          visibility: "public",
        });

        socialService.createActivity({
          type: "campaign_created",
          actor: user3,
          data: {},
          visibility: "public",
        });

        const feed = socialService.getFeed(user1);

        // Should include user2's activity but not user3's
        expect(feed.some((a) => a.actor === user2.toLowerCase())).toBe(true);
      });
    });

    describe("Badges", () => {
      const user = "0x1234567890123456789012345678901234567890";

      it("should award badge", () => {
        const badge = socialService.awardBadge(user, {
          id: "early-backer",
          name: "Early Backer",
          description: "Backed in first week",
          imageUrl: "https://badges.example.com/early.png",
          rarity: "rare",
        });

        expect(badge).toBeDefined();
        expect(badge.earnedAt).toBeDefined();

        const profile = socialService.getProfile(user);
        expect(profile.badges.length).toBe(1);
      });

      it("should prevent duplicate badges", () => {
        socialService.awardBadge(user, {
          id: "early-backer",
          name: "Early Backer",
          description: "Backed in first week",
          imageUrl: "https://badges.example.com/early.png",
          rarity: "rare",
        });

        expect(() =>
          socialService.awardBadge(user, {
            id: "early-backer",
            name: "Early Backer",
            description: "Backed in first week",
            imageUrl: "https://badges.example.com/early.png",
            rarity: "rare",
          })
        ).toThrow("already has this badge");
      });
    });

    describe("Leaderboards", () => {
      beforeEach(() => {
        // Set up some users with stats
        socialService.updateStats("0x1111111111111111111111111111111111111111", {
          campaignsCreated: 10,
          campaignsSuccessful: 8,
          totalRaised: BigInt("100000000000000000000"),
          totalBackers: 50,
        });

        socialService.updateStats("0x2222222222222222222222222222222222222222", {
          campaignsCreated: 5,
          campaignsSuccessful: 5,
          totalRaised: BigInt("50000000000000000000"),
          totalBackers: 25,
        });

        socialService.updateStats("0x3333333333333333333333333333333333333333", {
          campaignsBacked: 20,
          totalPledged: BigInt("10000000000000000000"),
          commemorativesEarned: 15,
        });
      });

      it("should get creator leaderboard by raised amount", () => {
        const leaderboard = socialService.getCreatorLeaderboard("raised");

        expect(leaderboard.length).toBe(2);
        expect(leaderboard[0].rank).toBe(1);
        expect(leaderboard[0].score).toBeGreaterThan(leaderboard[1].score);
      });

      it("should get creator leaderboard by success rate", () => {
        const leaderboard = socialService.getCreatorLeaderboard("success_rate");

        expect(leaderboard.length).toBe(2);
        // User2 has 100% success rate (5/5)
        expect(leaderboard[0].score).toBe(100);
      });

      it("should get backer leaderboard", () => {
        const leaderboard = socialService.getBackerLeaderboard("campaigns");

        expect(leaderboard.length).toBe(1);
        expect(leaderboard[0].score).toBe(20);
      });
    });

    describe("Statistics", () => {
      it("should return social statistics", () => {
        socialService.getProfile("0x1111111111111111111111111111111111111111");
        socialService.follow(
          "0x1111111111111111111111111111111111111111",
          "0x2222222222222222222222222222222222222222"
        );
        socialService.createComment("0x1111111111111111111111111111111111111111", {
          campaignId: "camp-1",
          content: "Test",
        });

        const stats = socialService.getStatistics();

        expect(stats.totalProfiles).toBeGreaterThanOrEqual(2);
        expect(stats.totalFollows).toBe(1);
        expect(stats.totalComments).toBe(1);
      });
    });
  });
});
