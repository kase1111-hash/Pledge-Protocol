import { Router, Request, Response } from "express";
import { z } from "zod";
import {
  ResolutionEngine,
  IResolutionDataProvider,
  oracleRouter,
  WebhookHandler,
  ResolutionJob,
} from "../../oracle";

const router = Router();

// Mock data provider for Phase 2 (replace with real DB/blockchain integration)
class MockResolutionDataProvider implements IResolutionDataProvider {
  private campaigns: Map<string, any> = new Map();
  private pledges: Map<string, any[]> = new Map();

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
    console.log(`Resolving pledge ${pledgeId}: release=${releaseAmount}, refund=${refundAmount}`);
  }

  async updateCampaignStatus(
    campaignId: string,
    status: string,
    totalReleased: string,
    totalRefunded: string
  ) {
    console.log(`Campaign ${campaignId} -> ${status}: released=${totalReleased}, refunded=${totalRefunded}`);
  }

  async mintCommemorative(
    pledgeId: string,
    holder: string,
    campaignId: string,
    outcomeSummary: string
  ) {
    console.log(`Minting commemorative for pledge ${pledgeId}: ${outcomeSummary}`);
  }

  // Methods to populate mock data
  setCampaign(campaignId: string, campaign: any) {
    this.campaigns.set(campaignId, campaign);
  }

  setPledges(campaignId: string, pledges: any[]) {
    this.pledges.set(campaignId, pledges);
  }
}

// Initialize services
const dataProvider = new MockResolutionDataProvider();
const resolutionEngine = new ResolutionEngine(oracleRouter, dataProvider);
const webhookHandler = new WebhookHandler(oracleRouter, resolutionEngine);

// Resolution event logging
resolutionEngine.on("resolution:queued", (job: ResolutionJob) => {
  console.log(`Resolution queued: ${job.id} for campaign ${job.campaignId}`);
});

resolutionEngine.on("resolution:completed", (job: ResolutionJob) => {
  console.log(`Resolution completed: ${job.id}`, job.result);
});

resolutionEngine.on("resolution:failed", (job: ResolutionJob) => {
  console.error(`Resolution failed: ${job.id}`, job.error);
});

// Validation schemas
const triggerResolutionSchema = z.object({
  campaignId: z.string(),
  force: z.boolean().optional(),
});

const scheduleResolutionSchema = z.object({
  campaignId: z.string(),
  deadline: z.number().int().positive(),
});

// Trigger campaign resolution
router.post("/trigger", async (req: Request, res: Response) => {
  try {
    const body = triggerResolutionSchema.parse(req.body);

    const job = await resolutionEngine.triggerResolution(
      body.campaignId,
      "manual"
    );

    res.status(202).json({
      jobId: job.id,
      campaignId: job.campaignId,
      status: job.status,
      message: "Resolution triggered",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "Invalid request body",
          details: error.errors,
        },
      });
    }
    throw error;
  }
});

// Schedule automatic resolution
router.post("/schedule", async (req: Request, res: Response) => {
  try {
    const body = scheduleResolutionSchema.parse(req.body);

    resolutionEngine.scheduleResolution(body.campaignId, body.deadline);

    res.status(200).json({
      campaignId: body.campaignId,
      scheduledFor: body.deadline,
      message: "Resolution scheduled",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "Invalid request body",
          details: error.errors,
        },
      });
    }
    throw error;
  }
});

// Cancel scheduled resolution
router.delete("/schedule/:campaignId", (req: Request, res: Response) => {
  const { campaignId } = req.params;

  resolutionEngine.cancelScheduledResolution(campaignId);

  res.json({
    campaignId,
    message: "Scheduled resolution cancelled",
  });
});

// Get resolution job status
router.get("/jobs/:jobId", (req: Request, res: Response) => {
  const { jobId } = req.params;

  const job = resolutionEngine.getJob(jobId);

  if (!job) {
    return res.status(404).json({
      error: {
        code: "JOB_NOT_FOUND",
        message: `Resolution job ${jobId} not found`,
      },
    });
  }

  res.json(job);
});

// Get all jobs for a campaign
router.get("/campaigns/:campaignId/jobs", (req: Request, res: Response) => {
  const { campaignId } = req.params;

  const jobs = resolutionEngine.getJobsForCampaign(campaignId);

  res.json({
    campaignId,
    jobs,
    count: jobs.length,
  });
});

// Verify milestones for a campaign (dry run)
router.post("/verify/:campaignId", async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { milestones } = req.body;

    if (!milestones || !Array.isArray(milestones)) {
      return res.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "milestones array required",
        },
      });
    }

    const results = [];

    for (const milestone of milestones) {
      const result = await oracleRouter.verifyMilestone(
        milestone.oracleId,
        campaignId,
        milestone.id,
        milestone.condition,
        milestone.params || {}
      );
      results.push(result);
    }

    const verified = results.filter((r) => r.verified).length;
    const failed = results.filter((r) => !r.verified).length;

    res.json({
      campaignId,
      results,
      summary: {
        total: results.length,
        verified,
        failed,
        allVerified: failed === 0,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: "VERIFICATION_ERROR",
        message: (error as Error).message,
      },
    });
  }
});

// Calculate pledge amounts (dry run)
router.post("/calculate/:campaignId", async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { pledges, oracleData, milestoneResults } = req.body;

    if (!pledges || !Array.isArray(pledges)) {
      return res.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "pledges array required",
        },
      });
    }

    // Calculate amounts for each pledge
    const calculations = pledges.map((pledge: any) => {
      const verifiedPercentage = milestoneResults
        ?.filter((m: any) => m.verified)
        .reduce((sum: number, m: any) => sum + (m.releasePercentage || 0), 0) || 0;

      let releaseAmount: bigint;
      let refundAmount: bigint;
      const escrowed = BigInt(pledge.escrowedAmount);

      if (pledge.pledgeType === "flat") {
        releaseAmount = (escrowed * BigInt(verifiedPercentage)) / BigInt(100);
        refundAmount = escrowed - releaseAmount;
      } else if (pledge.pledgeType === "per_unit" && oracleData) {
        const units = BigInt(oracleData[pledge.unitField] || 0);
        const perUnit = BigInt(pledge.perUnitAmount || 0);
        let calculated = units * perUnit;

        if (pledge.cap) {
          const cap = BigInt(pledge.cap);
          if (calculated > cap) calculated = cap;
        }

        releaseAmount = calculated > escrowed ? escrowed : calculated;
        refundAmount = escrowed - releaseAmount;
      } else {
        releaseAmount = verifiedPercentage === 100 ? escrowed : BigInt(0);
        refundAmount = escrowed - releaseAmount;
      }

      return {
        pledgeId: pledge.id,
        escrowedAmount: pledge.escrowedAmount,
        releaseAmount: releaseAmount.toString(),
        refundAmount: refundAmount.toString(),
        pledgeType: pledge.pledgeType,
      };
    });

    const totalRelease = calculations.reduce(
      (sum: bigint, c: any) => sum + BigInt(c.releaseAmount),
      BigInt(0)
    );
    const totalRefund = calculations.reduce(
      (sum: bigint, c: any) => sum + BigInt(c.refundAmount),
      BigInt(0)
    );

    res.json({
      campaignId,
      calculations,
      totals: {
        totalReleased: totalRelease.toString(),
        totalRefunded: totalRefund.toString(),
        pledgeCount: calculations.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: "CALCULATION_ERROR",
        message: (error as Error).message,
      },
    });
  }
});

// Get webhook handler stats
router.get("/webhooks/stats", (req: Request, res: Response) => {
  const stats = webhookHandler.getStats();
  res.json(stats);
});

export default router;

// Export services for use in other modules
export { resolutionEngine, webhookHandler, dataProvider };
