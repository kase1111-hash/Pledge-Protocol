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
 * Tier definition for tiered pledges
 */
interface Tier {
  threshold: number;  // Units at which this tier starts
  rate: bigint;       // Rate per unit in this tier (in wei)
}

/**
 * Calculation parameters for advanced pledges
 */
interface CalculationParams {
  // Per-unit parameters
  perUnitAmount?: string;
  unitField?: string;
  cap?: string;

  // Tiered parameters
  tiers?: Tier[];

  // Conditional parameters
  conditionField?: string;
  conditionOperator?: "exists" | "eq" | "gt" | "gte" | "lt" | "lte" | "between";
  conditionValue?: number;
  conditionValueEnd?: number;
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
  calculationParams?: CalculationParams;
}

/**
 * Resolution Engine
 * Phase 4: Handles automated campaign resolution with all pledge types
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
   * Calculate pledge amounts based on milestone results and pledge type
   */
  private calculatePledgeAmounts(
    pledge: PledgeForResolution,
    milestoneResults: VerificationResult[],
    milestones: CampaignMilestone[]
  ): { releaseAmount: bigint; refundAmount: bigint } {
    switch (pledge.pledgeType) {
      case "flat":
        return this.calculateFlatPledge(pledge, milestoneResults, milestones);

      case "per_unit":
        return this.calculatePerUnitPledge(pledge, milestoneResults);

      case "tiered":
        return this.calculateTieredPledge(pledge, milestoneResults);

      case "conditional":
        return this.calculateConditionalPledge(pledge, milestoneResults);

      default:
        // Unknown pledge type - refund all
        return { releaseAmount: BigInt(0), refundAmount: pledge.escrowedAmount };
    }
  }

  /**
   * Calculate flat pledge amounts (proportional to milestone completion)
   */
  private calculateFlatPledge(
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

    // Release proportional to milestones completed
    const releaseAmount =
      (pledge.escrowedAmount * BigInt(verifiedPercentage)) / BigInt(100);
    const refundAmount = pledge.escrowedAmount - releaseAmount;

    return { releaseAmount, refundAmount };
  }

  /**
   * Calculate per-unit pledge amounts
   * Formula: min(units * perUnitAmount, cap, escrowedAmount)
   */
  private calculatePerUnitPledge(
    pledge: PledgeForResolution,
    milestoneResults: VerificationResult[]
  ): { releaseAmount: bigint; refundAmount: bigint } {
    const params = pledge.calculationParams;

    if (!params?.perUnitAmount || !params?.unitField) {
      // Missing required params - refund all
      return { releaseAmount: BigInt(0), refundAmount: pledge.escrowedAmount };
    }

    // Find the oracle result that has the unit field
    const unitResult = this.findOracleDataWithField(milestoneResults, params.unitField);

    if (!unitResult || !unitResult.verified) {
      // No valid unit data or milestone not verified - refund all
      return { releaseAmount: BigInt(0), refundAmount: pledge.escrowedAmount };
    }

    // Extract units from oracle data
    const units = this.extractFieldValue(unitResult.oracleData, params.unitField);
    if (units === null || units < 0) {
      return { releaseAmount: BigInt(0), refundAmount: pledge.escrowedAmount };
    }

    // Calculate based on units
    const perUnitAmount = BigInt(params.perUnitAmount);
    let calculated = BigInt(Math.floor(units)) * perUnitAmount;

    // Apply cap if specified
    if (params.cap) {
      const capAmount = BigInt(params.cap);
      if (calculated > capAmount) {
        calculated = capAmount;
      }
    }

    // Can't release more than escrowed
    const releaseAmount = calculated > pledge.escrowedAmount
      ? pledge.escrowedAmount
      : calculated;

    return {
      releaseAmount,
      refundAmount: pledge.escrowedAmount - releaseAmount,
    };
  }

  /**
   * Calculate tiered pledge amounts
   * Applies stepped rates based on unit thresholds
   */
  private calculateTieredPledge(
    pledge: PledgeForResolution,
    milestoneResults: VerificationResult[]
  ): { releaseAmount: bigint; refundAmount: bigint } {
    const params = pledge.calculationParams;

    if (!params?.tiers || params.tiers.length === 0 || !params.unitField) {
      // Missing required params - refund all
      return { releaseAmount: BigInt(0), refundAmount: pledge.escrowedAmount };
    }

    // Find the oracle result that has the unit field
    const unitResult = this.findOracleDataWithField(milestoneResults, params.unitField);

    if (!unitResult || !unitResult.verified) {
      // No valid unit data or milestone not verified - refund all
      return { releaseAmount: BigInt(0), refundAmount: pledge.escrowedAmount };
    }

    // Extract units from oracle data
    const totalUnits = this.extractFieldValue(unitResult.oracleData, params.unitField);
    if (totalUnits === null || totalUnits < 0) {
      return { releaseAmount: BigInt(0), refundAmount: pledge.escrowedAmount };
    }

    // Sort tiers by threshold (ascending)
    const sortedTiers = [...params.tiers].sort((a, b) => a.threshold - b.threshold);

    // Calculate amount using tiered rates
    let calculated = BigInt(0);
    let unitsProcessed = 0;

    for (let i = 0; i < sortedTiers.length; i++) {
      const tier = sortedTiers[i];
      const nextThreshold = sortedTiers[i + 1]?.threshold ?? Infinity;

      // Units in this tier
      const tierStart = Math.max(tier.threshold, unitsProcessed);
      const tierEnd = Math.min(totalUnits, nextThreshold);

      if (tierEnd <= tierStart) {
        continue;
      }

      const unitsInTier = tierEnd - tierStart;
      calculated += BigInt(Math.floor(unitsInTier)) * tier.rate;
      unitsProcessed = tierEnd;

      if (unitsProcessed >= totalUnits) {
        break;
      }
    }

    // Apply cap if specified
    if (params.cap) {
      const capAmount = BigInt(params.cap);
      if (calculated > capAmount) {
        calculated = capAmount;
      }
    }

    // Can't release more than escrowed
    const releaseAmount = calculated > pledge.escrowedAmount
      ? pledge.escrowedAmount
      : calculated;

    return {
      releaseAmount,
      refundAmount: pledge.escrowedAmount - releaseAmount,
    };
  }

  /**
   * Calculate conditional pledge amounts
   * All-or-nothing based on condition evaluation
   */
  private calculateConditionalPledge(
    pledge: PledgeForResolution,
    milestoneResults: VerificationResult[]
  ): { releaseAmount: bigint; refundAmount: bigint } {
    const params = pledge.calculationParams;

    if (!params?.conditionField || !params?.conditionOperator) {
      // Missing required params - refund all
      return { releaseAmount: BigInt(0), refundAmount: pledge.escrowedAmount };
    }

    // Find the oracle result that has the condition field
    const conditionResult = this.findOracleDataWithField(
      milestoneResults,
      params.conditionField
    );

    if (!conditionResult || !conditionResult.verified) {
      // No valid data or milestone not verified - refund all
      return { releaseAmount: BigInt(0), refundAmount: pledge.escrowedAmount };
    }

    // Evaluate the condition
    const conditionMet = this.evaluateCondition(
      conditionResult.oracleData,
      params.conditionField,
      params.conditionOperator,
      params.conditionValue,
      params.conditionValueEnd
    );

    if (conditionMet) {
      // Condition met - release full amount
      return { releaseAmount: pledge.escrowedAmount, refundAmount: BigInt(0) };
    } else {
      // Condition not met - refund all
      return { releaseAmount: BigInt(0), refundAmount: pledge.escrowedAmount };
    }
  }

  /**
   * Find oracle result containing a specific field
   */
  private findOracleDataWithField(
    results: VerificationResult[],
    field: string
  ): VerificationResult | undefined {
    return results.find((r) => {
      if (!r.oracleData) return false;
      return this.extractFieldValue(r.oracleData, field) !== null;
    });
  }

  /**
   * Extract a field value from oracle data (supports nested paths)
   */
  private extractFieldValue(data: any, field: string): number | null {
    if (!data || !field) return null;

    const parts = field.split(".");
    let value = data;

    for (const part of parts) {
      if (value === null || value === undefined) return null;
      value = value[part];
    }

    if (typeof value === "number") {
      return value;
    }

    if (typeof value === "string") {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? null : parsed;
    }

    return null;
  }

  /**
   * Evaluate a condition against oracle data
   */
  private evaluateCondition(
    data: any,
    field: string,
    operator: string,
    value?: number,
    valueEnd?: number
  ): boolean {
    const fieldValue = this.extractFieldValue(data, field);

    switch (operator) {
      case "exists":
        return fieldValue !== null;

      case "eq":
        return fieldValue !== null && value !== undefined && fieldValue === value;

      case "gt":
        return fieldValue !== null && value !== undefined && fieldValue > value;

      case "gte":
        return fieldValue !== null && value !== undefined && fieldValue >= value;

      case "lt":
        return fieldValue !== null && value !== undefined && fieldValue < value;

      case "lte":
        return fieldValue !== null && value !== undefined && fieldValue <= value;

      case "between":
        return (
          fieldValue !== null &&
          value !== undefined &&
          valueEnd !== undefined &&
          fieldValue >= value &&
          fieldValue <= valueEnd
        );

      default:
        return false;
    }
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
          this.generateOutcomeSummary(milestoneResults, pledge)
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
  private generateOutcomeSummary(
    results: VerificationResult[],
    pledge?: PledgeForResolution
  ): string {
    const verifiedCount = results.filter((r) => r.verified).length;

    if (verifiedCount === results.length) {
      // All milestones completed - extract relevant data
      const firstResult = results[0];
      if (firstResult?.oracleData) {
        const data = firstResult.oracleData;

        // Race result with pledge-specific data
        if (data.distanceMiles && data.timeSeconds) {
          const time = this.formatTime(data.timeSeconds);
          const summary = `${data.distanceMiles} miles in ${time}`;

          // Add per-unit context if applicable
          if (pledge?.pledgeType === "per_unit" && pledge.calculationParams?.unitField) {
            const units = this.extractFieldValue(data, pledge.calculationParams.unitField);
            if (units !== null) {
              return `${summary} (${units} ${pledge.calculationParams.unitField})`;
            }
          }

          return summary;
        }

        // PR merged
        if (data.prMerged !== undefined) {
          return data.prMerged ? "PR merged successfully" : "PR not merged";
        }

        // Academic completion
        if (data.degreeConferred) {
          return `Degree conferred: ${data.degreeConferred}`;
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
   * Dry-run calculation for a pledge (testing/preview)
   */
  calculatePledgePreview(
    pledge: PledgeForResolution,
    oracleData: any,
    milestones: CampaignMilestone[]
  ): { releaseAmount: bigint; refundAmount: bigint; breakdown: string } {
    // Create mock milestone results
    const mockResults: VerificationResult[] = milestones.map((m) => ({
      milestoneId: m.id,
      campaignId: pledge.campaignId,
      verified: true,
      oracleData: oracleData,
      evaluatedCondition: m.condition,
      timestamp: Date.now(),
    }));

    const { releaseAmount, refundAmount } = this.calculatePledgeAmounts(
      pledge,
      mockResults,
      milestones
    );

    // Generate breakdown description
    let breakdown: string;
    switch (pledge.pledgeType) {
      case "per_unit":
        const units = pledge.calculationParams?.unitField
          ? this.extractFieldValue(oracleData, pledge.calculationParams.unitField)
          : null;
        breakdown = `Per-unit: ${units ?? 0} units × ${pledge.calculationParams?.perUnitAmount ?? 0} = ${releaseAmount.toString()}`;
        break;
      case "tiered":
        breakdown = `Tiered calculation based on ${pledge.calculationParams?.tiers?.length ?? 0} tiers`;
        break;
      case "conditional":
        breakdown = `Conditional: ${releaseAmount > 0 ? "condition met" : "condition not met"}`;
        break;
      default:
        breakdown = `Flat: ${releaseAmount.toString()} released`;
    }

    return { releaseAmount, refundAmount, breakdown };
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
