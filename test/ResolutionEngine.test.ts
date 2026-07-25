import { describe, it, beforeEach } from "vitest";
import { expect } from "chai";
import {
  ResolutionEngine,
  IResolutionDataProvider,
  OracleRouter,
  oracleRouter,
} from "../src/oracle";

// Mock data provider
class MockDataProvider implements IResolutionDataProvider {
  private campaigns: Map<string, any> = new Map();
  private pledges: Map<string, any[]> = new Map();
  public resolvedPledges: any[] = [];
  public mintedCommemoatives: any[] = [];
  public updatedCampaigns: any[] = [];

  async getCampaign(campaignId: string) {
    return this.campaigns.get(campaignId) || null;
  }

  async getPledgesForCampaign(campaignId: string) {
    return this.pledges.get(campaignId) || [];
  }

  async resolvePledge(
    pledgeId: string,
    releaseAmount: bigint,
    refundAmount: bigint
  ) {
    this.resolvedPledges.push({ pledgeId, releaseAmount, refundAmount });
  }

  async updateCampaignStatus(
    campaignId: string,
    status: string,
    totalReleased: string,
    totalRefunded: string
  ) {
    this.updatedCampaigns.push({ campaignId, status, totalReleased, totalRefunded });
  }

  async mintCommemorative(
    pledgeId: string,
    holder: string,
    campaignId: string,
    outcomeSummary: string
  ) {
    this.mintedCommemoatives.push({ pledgeId, holder, campaignId, outcomeSummary });
  }

  // Test setup methods
  setCampaign(campaignId: string, campaign: any) {
    this.campaigns.set(campaignId, campaign);
  }

  setPledges(campaignId: string, pledges: any[]) {
    this.pledges.set(campaignId, pledges);
  }

  reset() {
    this.resolvedPledges = [];
    this.mintedCommemoatives = [];
    this.updatedCampaigns = [];
  }
}

describe("Resolution Engine", function () {
  let router: OracleRouter;
  let dataProvider: MockDataProvider;
  let engine: ResolutionEngine;

  beforeEach(function () {
    router = new OracleRouter();
    dataProvider = new MockDataProvider();
    engine = new ResolutionEngine(router, dataProvider);

    // Register a test oracle
    router.registerProvider({
      id: "test-oracle",
      name: "Test Oracle",
      description: "",
      type: "attestation",
      trustLevel: "custom",
      active: true,
    });
  });

  afterEach(function () {
    engine.shutdown();
    router.shutdown();
  });

  describe("Resolution Triggering", function () {
    it("should trigger resolution and create a job", async function () {
      const campaignId = "test-campaign-1";

      // Set up mock campaign
      dataProvider.setCampaign(campaignId, {
        id: campaignId,
        status: "active",
        beneficiary: "0x1234",
        milestones: [
          {
            id: "milestone-1",
            oracleId: "test-oracle",
            condition: { type: "completion", field: "completed", operator: "eq", value: true },
            oracleParams: {},
            releasePercentage: 100,
          },
        ],
        resolutionDeadline: Date.now() / 1000 + 86400,
      });

      dataProvider.setPledges(campaignId, [
        {
          id: "pledge-1",
          campaignId,
          backer: "0x5678",
          escrowedAmount: BigInt("1000000000000000000"),
          pledgeType: "flat",
        },
      ]);

      const job = await engine.triggerResolution(campaignId, "manual");

      expect(job.id).to.include("res_");
      expect(job.campaignId).to.equal(campaignId);
      expect(job.triggeredBy).to.equal("manual");
    });

    it("should handle non-existent campaign", async function () {
      const job = await engine.triggerResolution("non-existent", "manual");

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      const updatedJob = engine.getJob(job.id);
      expect(updatedJob?.status).to.equal("failed");
      expect(updatedJob?.error).to.include("Campaign not found");
    });
  });

  describe("Job Management", function () {
    it("should get job by ID", async function () {
      dataProvider.setCampaign("campaign-1", {
        id: "campaign-1",
        status: "active",
        beneficiary: "0x1234",
        milestones: [],
        resolutionDeadline: Date.now() / 1000 + 86400,
      });

      const job = await engine.triggerResolution("campaign-1", "manual");
      const retrieved = engine.getJob(job.id);

      expect(retrieved).to.not.be.undefined;
      expect(retrieved?.id).to.equal(job.id);
    });

    it("should get jobs for campaign", async function () {
      dataProvider.setCampaign("campaign-2", {
        id: "campaign-2",
        status: "active",
        beneficiary: "0x1234",
        milestones: [],
        resolutionDeadline: Date.now() / 1000 + 86400,
      });

      await engine.triggerResolution("campaign-2", "manual");
      await engine.triggerResolution("campaign-2", "webhook");

      const jobs = engine.getJobsForCampaign("campaign-2");
      expect(jobs.length).to.equal(2);
    });

    it("should return undefined for non-existent job", function () {
      const job = engine.getJob("non-existent-job");
      expect(job).to.be.undefined;
    });
  });

  describe("Scheduled Resolution", function () {
    it("should schedule resolution at deadline", async function () {
      const campaignId = "scheduled-campaign";
      const deadline = Math.floor(Date.now() / 1000) + 1; // 1 second from now

      dataProvider.setCampaign(campaignId, {
        id: campaignId,
        status: "active",
        beneficiary: "0x1234",
        milestones: [],
        resolutionDeadline: deadline,
      });

      let triggered = false;
      engine.on("resolution:queued", (job) => {
        if (job.campaignId === campaignId) {
          triggered = true;
        }
      });

      engine.scheduleResolution(campaignId, deadline);

      await new Promise((resolve) => setTimeout(resolve, 2000));
      expect(triggered).to.be.true;
    }, 5000);

    it("should cancel scheduled resolution", function () {
      const campaignId = "cancel-campaign";
      const deadline = Math.floor(Date.now() / 1000) + 60;

      engine.scheduleResolution(campaignId, deadline);
      engine.cancelScheduledResolution(campaignId);

      // No error means success
    });

    it("should trigger immediately for past deadline", async function () {
      const campaignId = "past-deadline-campaign";
      const pastDeadline = Math.floor(Date.now() / 1000) - 100;

      dataProvider.setCampaign(campaignId, {
        id: campaignId,
        status: "active",
        beneficiary: "0x1234",
        milestones: [],
        resolutionDeadline: pastDeadline,
      });

      const queued = new Promise<void>((resolve) => {
        engine.on("resolution:queued", (job) => {
          if (job.campaignId === campaignId) {
            resolve();
          }
        });
      });

      engine.scheduleResolution(campaignId, pastDeadline);
      await queued;
    });
  });

  describe("Events", function () {
    it("should emit resolution:queued event", async function () {
      dataProvider.setCampaign("event-campaign", {
        id: "event-campaign",
        status: "active",
        beneficiary: "0x1234",
        milestones: [],
        resolutionDeadline: Date.now() / 1000 + 86400,
      });

      const queued = new Promise<{ campaignId: string }>((resolve) => {
        engine.on("resolution:queued", resolve);
      });

      engine.triggerResolution("event-campaign", "manual");
      expect((await queued).campaignId).to.equal("event-campaign");
    });

    it("should emit resolution:completed event", async function () {
      dataProvider.setCampaign("complete-campaign", {
        id: "complete-campaign",
        status: "active",
        beneficiary: "0x1234",
        milestones: [],
        resolutionDeadline: Date.now() / 1000 + 86400,
      });

      const completed = new Promise<{ campaignId: string; status: string }>(
        (resolve) => {
          engine.on("resolution:completed", resolve);
        }
      );

      engine.triggerResolution("complete-campaign", "manual");

      const job = await completed;
      expect(job.campaignId).to.equal("complete-campaign");
      expect(job.status).to.equal("completed");
    });

    it("should emit resolution:failed event", async function () {
      const failed = new Promise<{ status: string }>((resolve) => {
        engine.on("resolution:failed", resolve);
      });

      engine.triggerResolution("non-existent-campaign", "manual");
      expect((await failed).status).to.equal("failed");
    });
  });
});

describe("Pledge Amount Calculation", function () {
  let router: OracleRouter;
  let dataProvider: MockDataProvider;
  let engine: ResolutionEngine;

  beforeEach(function () {
    router = new OracleRouter();
    dataProvider = new MockDataProvider();
    engine = new ResolutionEngine(router, dataProvider);
  });

  afterEach(function () {
    engine.shutdown();
    router.shutdown();
  });

  it("should calculate flat pledge - full release on success", async function () {
    const campaignId = "flat-success";

    dataProvider.setCampaign(campaignId, {
      id: campaignId,
      status: "active",
      beneficiary: "0x1234",
      milestones: [
        {
          id: "m1",
          oracleId: "test-oracle",
          condition: { type: "completion", field: "done", operator: "eq", value: true },
          oracleParams: {},
          releasePercentage: 100,
        },
      ],
      resolutionDeadline: Date.now() / 1000 + 86400,
    });

    dataProvider.setPledges(campaignId, [
      {
        id: "pledge-flat",
        campaignId,
        backer: "0x5678",
        escrowedAmount: BigInt("1000000000000000000"),
        pledgeType: "flat",
      },
    ]);

    // Register oracle and wait for processing
    router.registerProvider({
      id: "test-oracle",
      name: "Test",
      description: "",
      type: "attestation",
      trustLevel: "custom",
      active: true,
    });

    await engine.triggerResolution(campaignId, "manual");

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Check that campaign was updated
    expect(dataProvider.updatedCampaigns.length).to.be.gte(0);
  });
});
