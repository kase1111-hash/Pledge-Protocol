import { EventEmitter } from "events";
import { OracleRouter } from "./router";
import {
  MilestoneCondition,
  VerificationResult,
  ResolutionJob,
  ResolutionResult,
} from "./types";

/**
 * Campaign milestone definition
 */
interface CampaignMilestone {
  id: string;
  oracleId: string;
  condition: MilestoneCondition;
  oracleParams: Record<string, any>;
  releasePercentage: number;
}

/**
 * Campaign definition for resolution
 */
interface CampaignForResolution {
  id: string;
  status: string;
  beneficiary: string;
  milestones: CampaignMilestone[];
  resolutionDeadline: number;
}

/**
 * Pledge for resolution
 */
interface PledgeForResolution {
  id: string;
  campaignId: string;
  backer: string;
  escrowedAmount: bigint;
  pledgeType: "flat" | "per_unit" | "tiered" | "conditional";
  calculationParams?: Record<string, any>;
}

/**
 * Resolution Engine
 * Handles automated campaign resolution based on oracle data
 */
export class ResolutionEngine extends EventEmitter {
  private jobs: Map<string, ResolutionJob> = new Map();
  private scheduledResolutions: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private oracleRouter: OracleRouter,
    private dataProvider: IResolutionDataProvider
  ) {
    super();
  }

  /**
   * Trigger resolution for a campaign
   */
  async triggerResolution(
    campaignId: string,
    triggeredBy: "manual" | "webhook" | "poll" | "schedule"
  ): Promise<ResolutionJob> {
    const jobId = `res_${campaignId}_${Date.now()}`;

    const job: ResolutionJob = {
      id: jobId,
      campaignId,
      status: "pending",
      triggeredBy,
      createdAt: Date.now(),
    };

    this.jobs.set(jobId, job);
    this.emit("resolution:queued", job);

    // Process asynchronously
    this.processResolution(job);

    return job;
  }

  /**
   * Process a resolution job
   */
  private async processResolution(job: ResolutionJob): Promise<void> {
    job.status = "processing";
    this.emit("resolution:processing", job);

    try {
      // Get campaign data
      const campaign = await this.dataProvider.getCampaign(job.campaignId);
      if (!campaign) {
        throw new Error(`Campaign not found: ${job.campaignId}`);
      }

      // Verify all milestones
      const milestoneResults = await this.verifyAllMilestones(campaign);

      // Calculate milestone completion
      const milestonesVerified = milestoneResults.filter((r) => r.verified).length;
      const milestonesFailed = milestoneResults.filter((r) => !r.verified).length;

      // Get pledges
      const pledges = await this.dataProvider.getPledgesForCampaign(job.campaignId);

      // Resolve each pledge
      let totalReleased = BigInt(0);
      let totalRefunded = BigInt(0);
      let pledgesResolved = 0;

      for (const pledge of pledges) {
        const { releaseAmount, refundAmount } = this.calculatePledgeAmounts(
          pledge,
          milestoneResults,
          campaign.milestones
        );

        await this.dataProvider.resolvePledge(
          pledge.id,
          releaseAmount,
          refundAmount
        );

        totalReleased += releaseAmount;
        totalRefunded += refundAmount;
        pledgesResolved++;
      }

      // Update campaign status
      await this.dataProvider.updateCampaignStatus(
        job.campaignId,
        "resolved",
        totalReleased.toString(),
        totalRefunded.toString()
      );

      // Mint commemoratives
      const commemorativesMinted = await this.mintCommemoatives(
        pledges,
        campaign,
        milestoneResults
      );

      // Complete the job
      job.status = "completed";
      job.processedAt = Date.now();
      job.result = {
        campaignId: job.campaignId,
        milestonesVerified,
        milestonesFailed,
        pledgesResolved,
        totalReleased: totalReleased.toString(),
        totalRefunded: totalRefunded.toString(),
        commemorativesMinted,
      };

      this.emit("resolution:completed", job);
    } catch (error) {
      job.status = "failed";
      job.processedAt = Date.now();
      job.error = (error as Error).message;

      this.emit("resolution:failed", job);
    }
  }

  /**
   * Verify all milestones for a campaign
   */
  private async verifyAllMilestones(
    campaign: CampaignForResolution
  ): Promise<VerificationResult[]> {
    const results: VerificationResult[] = [];

    for (const milestone of campaign.milestones) {
      const result = await this.oracleRouter.verifyMilestone(
        milestone.oracleId,
        campaign.id,
        milestone.id,
        milestone.condition,
        milestone.oracleParams
      );

      results.push(result);
    }

    return results;
  }

  /**
   * Calculate pledge amounts based on milestone results
   */
  private calculatePledgeAmounts(
    pledge: PledgeForResolution,
    milestoneResults: VerificationResult[],
    milestones: CampaignMilestone[]
  ): { releaseAmount: bigint; refundAmount: bigint } {
    // Calculate total verified percentage
    let verifiedPercentage = 0;

    for (let i = 0; i < milestones.length; i++) {
      if (milestoneResults[i]?.verified) {
        verifiedPercentage += milestones[i].releasePercentage;
      }
    }

    // For flat pledges, release proportional to milestones completed
    if (pledge.pledgeType === "flat") {
      const releaseAmount =
        (pledge.escrowedAmount * BigInt(verifiedPercentage)) / BigInt(100);
      const refundAmount = pledge.escrowedAmount - releaseAmount;

      return { releaseAmount, refundAmount };
    }

    // For per-unit pledges, calculate based on oracle value
    if (pledge.pledgeType === "per_unit" && pledge.calculationParams) {
      const { perUnitAmount, unitField, cap } = pledge.calculationParams;

      // Find the oracle result that has the unit field
      const unitResult = milestoneResults.find(
        (r) => r.oracleData && r.oracleData[unitField] !== undefined
      );

      if (unitResult && unitResult.verified) {
        const units = BigInt(Math.floor(unitResult.oracleData[unitField]));
        let calculated = units * BigInt(perUnitAmount);

        // Apply cap
        if (cap) {
          const capAmount = BigInt(cap);
          if (calculated > capAmount) {
            calculated = capAmount;
          }
        }

        // Can't release more than escrowed
        const releaseAmount =
          calculated > pledge.escrowedAmount
            ? pledge.escrowedAmount
            : calculated;

        return {
          releaseAmount,
          refundAmount: pledge.escrowedAmount - releaseAmount,
        };
      }

      // No valid unit data - refund all
      return { releaseAmount: BigInt(0), refundAmount: pledge.escrowedAmount };
    }

    // Default: full release if all milestones verified, else full refund
    if (verifiedPercentage === 100) {
      return { releaseAmount: pledge.escrowedAmount, refundAmount: BigInt(0) };
    }

    return { releaseAmount: BigInt(0), refundAmount: pledge.escrowedAmount };
  }

  /**
   * Mint commemorative tokens for resolved pledges
   */
  private async mintCommemoatives(
    pledges: PledgeForResolution[],
    campaign: CampaignForResolution,
    milestoneResults: VerificationResult[]
  ): Promise<number> {
    let minted = 0;

    for (const pledge of pledges) {
      try {
        await this.dataProvider.mintCommemorative(
          pledge.id,
          pledge.backer,
          campaign.id,
          this.generateOutcomeSummary(milestoneResults)
        );
        minted++;
      } catch (error) {
        console.error(`Failed to mint commemorative for pledge ${pledge.id}:`, error);
      }
    }

    return minted;
  }

  /**
   * Generate outcome summary for commemorative
   */
  private generateOutcomeSummary(results: VerificationResult[]): string {
    const verifiedCount = results.filter((r) => r.verified).length;

    if (verifiedCount === results.length) {
      // All milestones completed - extract relevant data
      const firstResult = results[0];
      if (firstResult?.oracleData) {
        const data = firstResult.oracleData;

        // Race result
        if (data.distanceMiles && data.timeSeconds) {
          const time = this.formatTime(data.timeSeconds);
          return `${data.distanceMiles} miles in ${time}`;
        }

        // PR merged
        if (data.prMerged !== undefined) {
          return data.prMerged ? "PR merged successfully" : "PR not merged";
        }
      }

      return "All milestones completed";
    }

    return `${verifiedCount}/${results.length} milestones completed`;
  }

  /**
   * Format seconds to time string
   */
  private formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }

    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }

  /**
   * Schedule automatic resolution at deadline
   */
  scheduleResolution(campaignId: string, deadline: number): void {
    const delay = deadline * 1000 - Date.now();

    if (delay <= 0) {
      // Deadline already passed
      this.triggerResolution(campaignId, "schedule");
      return;
    }

    const timer = setTimeout(() => {
      this.triggerResolution(campaignId, "schedule");
      this.scheduledResolutions.delete(campaignId);
    }, delay);

    this.scheduledResolutions.set(campaignId, timer);
  }

  /**
   * Cancel scheduled resolution
   */
  cancelScheduledResolution(campaignId: string): void {
    const timer = this.scheduledResolutions.get(campaignId);
    if (timer) {
      clearTimeout(timer);
      this.scheduledResolutions.delete(campaignId);
    }
  }

  /**
   * Get job status
   */
  getJob(jobId: string): ResolutionJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get all jobs for a campaign
   */
  getJobsForCampaign(campaignId: string): ResolutionJob[] {
    return Array.from(this.jobs.values()).filter(
      (job) => job.campaignId === campaignId
    );
  }

  /**
   * Shutdown the engine
   */
  shutdown(): void {
    // Clear all scheduled resolutions
    for (const timer of this.scheduledResolutions.values()) {
      clearTimeout(timer);
    }
    this.scheduledResolutions.clear();

    this.emit("shutdown");
  }
}

/**
 * Interface for data provider (database/blockchain)
 */
export interface IResolutionDataProvider {
  getCampaign(campaignId: string): Promise<CampaignForResolution | null>;
  getPledgesForCampaign(campaignId: string): Promise<PledgeForResolution[]>;
  resolvePledge(
    pledgeId: string,
    releaseAmount: bigint,
    refundAmount: bigint
  ): Promise<void>;
  updateCampaignStatus(
    campaignId: string,
    status: string,
    totalReleased: string,
    totalRefunded: string
  ): Promise<void>;
  mintCommemorative(
    pledgeId: string,
    holder: string,
    campaignId: string,
    outcomeSummary: string
  ): Promise<void>;
}
