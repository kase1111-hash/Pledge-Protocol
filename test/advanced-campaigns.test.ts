/**
 * Advanced campaign features read and change stored campaigns
 */

import { describe, it, expect, beforeEach } from "vitest";
import { parseEther } from "ethers";
import { getStore, MemoryStore, setStore } from "../src/database";
import { AdvancedCampaignService, createAdvancedCampaignService } from "../src/campaigns-advanced";
import { notificationService } from "../src/notifications";
import { campaign, DAY, milestone, nowSeconds, pledge } from "./helpers/fixtures";

const CREATOR = "0x00000000000000000000000000000000000000c1";
const BACKER = "0x00000000000000000000000000000000000000a1";
const OTHER_BACKER = "0x00000000000000000000000000000000000000a2";
const eth = (n: string) => parseEther(n).toString();

describe("AdvancedCampaignService", () => {
  let service: AdvancedCampaignService;

  beforeEach(async () => {
    setStore(new MemoryStore());
    service = createAdvancedCampaignService();

    const now = nowSeconds();
    await getStore().saveCampaign(campaign({ id: "campaign_1", creator: CREATOR }));
    await getStore().saveCampaign(campaign({ id: "campaign_draft", name: "Later", status: "draft" }));
    await getStore().savePledge(pledge({ id: "p1", backer: BACKER, escrowedAmount: eth("1"), createdAt: now - 5 * DAY }));
    await getStore().savePledge(pledge({ id: "p2", backer: BACKER, escrowedAmount: eth("0.5"), createdAt: now - 3600 }));
    await getStore().savePledge(pledge({ id: "p3", backer: OTHER_BACKER, escrowedAmount: eth("1.5"), createdAt: now - 7200 }));
    await getStore().savePledge(
      pledge({ id: "p4", backer: OTHER_BACKER, escrowedAmount: eth("9"), status: "cancelled", createdAt: now - 7200 })
    );
  });

  describe("recurring campaigns", () => {
    const params = (startDate: number) => ({
      templateCampaignId: "campaign_1",
      ownerAddress: CREATOR,
      name: "Monthly run",
      description: "",
      frequency: "weekly" as const,
      schedule: { startDate },
    });

    it("requires an existing template campaign", async () => {
      await expect(
        service.createRecurringCampaign({ ...params(Date.now()), templateCampaignId: "missing" })
      ).rejects.toThrow(/not found/);
    });

    it("stores each instance as a real campaign copied from the template", async () => {
      const recurring = await service.createRecurringCampaign(params(Date.now() - DAY * 1000 * 8));
      expect(recurring.status).toBe("active");

      const instance = recurring.instances[0];
      const stored = await getStore().getCampaign(instance.campaignId);
      expect(stored).toMatchObject({
        name: "Monthly run #1",
        creator: CREATOR,
        status: "active",
        totalEscrowed: "0",
        pledgeWindowEnd: Math.floor(instance.endDate / 1000),
      });
      expect(stored!.milestones.every((m) => m.status === "pending")).toBe(true);
    });

    it("stores future instances as drafts and launches them when due", async () => {
      const recurring = await service.createRecurringCampaign({
        ...params(Date.now() + 3600_000),
        settings: { autoCreateInstances: false },
      });
      const instance = await service.createNextInstance(recurring.id);
      expect((await getStore().getCampaign(instance.campaignId))!.status).toBe("draft");

      const launch = service.getScheduledActions(instance.campaignId).find((a) => a.type === "launch")!;
      const [processed] = await service.processScheduledActions(launch.scheduledFor);
      expect(processed.status).toBe("executed");
      expect((await getStore().getCampaign(instance.campaignId))!.status).toBe("active");
    });
  });

  describe("stretch goals", () => {
    it("measures progress from stored pledges", async () => {
      const reached = service.addStretchGoal("campaign_1", {
        name: "2 ETH",
        description: "",
        type: "amount",
        threshold: eth("2"),
        reward: { type: "bonus", description: "" },
      });
      service.addStretchGoal("campaign_1", {
        name: "5 backers",
        description: "",
        type: "backers",
        threshold: "5",
        reward: { type: "bonus", description: "" },
      });

      const progress = await service.checkStretchGoalProgress("campaign_1");
      expect(progress.currentAmount).toBe(eth("3")); // cancelled pledge excluded
      expect(progress.currentBackers).toBe(2);
      expect(progress.goals.map((g) => [g.progress, g.status])).toEqual([
        [100, "achieved"],
        [40, "unlocked"],
      ]);
      expect(progress.nextGoal).toMatchObject({ name: "5 backers", remaining: "3" });
      expect(service.getStretchGoal(reached.id)!.achievedAt).toBeDefined();
    });

    it("rejects amount thresholds that are not wei", () => {
      expect(() =>
        service.addStretchGoal("campaign_1", {
          name: "Bad",
          description: "",
          type: "amount",
          threshold: "10,000",
          reward: { type: "bonus", description: "" },
        })
      ).toThrow(/wei/);
    });
  });

  describe("scheduled actions", () => {
    it("only accepts actions it can carry out", () => {
      expect(() =>
        service.scheduleAction("campaign_1", {
          campaignId: "campaign_1",
          type: "pause",
          scheduledFor: Date.now(),
          createdBy: CREATOR,
        })
      ).toThrow(/not supported/);
    });

    it("closes pledging and notifies backers when due", async () => {
      const at = Date.now() + 1000;
      service.scheduleAction("campaign_1", { campaignId: "campaign_1", type: "close", scheduledFor: at, createdBy: CREATOR });
      service.scheduleAction("campaign_1", {
        campaignId: "campaign_1",
        type: "notify",
        scheduledFor: at,
        params: { recipientType: "backers", message: "Last day!" },
        createdBy: CREATOR,
      });

      expect(await service.processScheduledActions(at - 2000)).toEqual([]);
      const processed = await service.processScheduledActions(at);
      expect(processed.map((a) => a.status)).toEqual(["executed", "executed"]);

      expect((await getStore().getCampaign("campaign_1"))!.status).toBe("pledging_closed");
      for (const backer of [BACKER, OTHER_BACKER]) {
        const [notification] = notificationService.getNotifications({ recipient: backer, eventType: "campaign_reminder" });
        expect(notification.message).toBe("Last day!");
      }
      expect(notificationService.getNotifications({ recipient: CREATOR, eventType: "campaign_reminder" })).toEqual([]);
    });

    it("records a failure when the campaign cannot change", async () => {
      service.scheduleLaunch("campaign_1", Date.now() + 1000, {
        allowPrePledges: false,
        showPreview: true,
        notifyFollowers: false,
        reminderHours: [],
      });
      const [action] = await service.processScheduledActions(Date.now() + 1000);
      expect(action.status).toBe("failed");
      expect(action.errorMessage).toMatch(/not draft/);
    });
  });

  describe("series", () => {
    it("uses stored campaign names and totals", async () => {
      const series = service.createSeries({ ownerAddress: CREATOR, name: "Season", description: "" });
      await service.addCampaignToSeries(series.id, "campaign_1", "standalone");
      await service.addCampaignToSeries(series.id, "campaign_draft", "sequel");
      await expect(service.addCampaignToSeries(series.id, "missing", "sequel")).rejects.toThrow(/not found/);

      const withTotals = await service.getSeriesWithTotals(series.id);
      expect(withTotals!.campaigns.map((c) => [c.name, c.status])).toEqual([
        ["Marathon", "active"],
        ["Later", "draft"],
      ]);
      expect(withTotals!.metadata).toMatchObject({ totalRaised: eth("3"), totalBackers: 2, averagePerCampaign: eth("1.5") });
    });
  });

  describe("predictions", () => {
    it("projects funding over the rest of the pledge window", async () => {
      // Half the window has passed with 3 ETH pledged
      const prediction = await service.getPrediction("campaign_1");
      expect(BigInt(prediction.predictedFinalAmount)).toBeGreaterThan(parseEther("5.99"));
      expect(BigInt(prediction.predictedFinalAmount)).toBeLessThan(parseEther("6.01"));
      expect(prediction.predictedBackers).toBe(4);
      expect(prediction.fundingProbability).toBeNull();
    });

    it("projects no growth once pledging has closed", async () => {
      const stored = (await getStore().getCampaign("campaign_1"))!;
      await getStore().saveCampaign({ ...stored, status: "pledging_closed" });

      const prediction = await service.getPrediction("campaign_1");
      expect(prediction.predictedFinalAmount).toBe(eth("3"));
      expect(prediction.confidence).toBe(100);
    });

    it("buckets pledges by period", async () => {
      const velocity = await service.getFundingVelocity("campaign_1", "day");

      expect(velocity.dataPoints).toHaveLength(30);
      const last = velocity.dataPoints[29];
      expect(last).toMatchObject({ amount: eth("2"), cumulative: eth("3"), backers: 2 });
      expect(last.velocity).toBeCloseTo(2 / 24);
      expect(velocity.trend).toBe("accelerating");
    });

    it("rejects unknown campaigns", async () => {
      await expect(service.getPrediction("missing")).rejects.toThrow(/not found/);
    });
  });

  describe("milestone scheduling", () => {
    it("checks a real milestone and reflects its stored status", async () => {
      await expect(
        service.scheduleMilestoneVerification("campaign_1", "milestone_9", Date.now())
      ).rejects.toThrow(/not found/);

      const at = Date.now() + 1000;
      const schedule = await service.scheduleMilestoneVerification("campaign_1", "milestone_0", at);
      expect(schedule).toMatchObject({ campaignId: "campaign_1", name: "Finish", status: "scheduled" });

      const stored = (await getStore().getCampaign("campaign_1"))!;
      stored.milestones = [milestone({ status: "verified", verifiedAt: nowSeconds() })];
      await getStore().saveCampaign(stored);

      const [action] = await service.processScheduledActions(at);
      expect(action.status).toBe("executed");
      expect(schedule.status).toBe("verified");
    });
  });
});
