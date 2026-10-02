/**
 * Connects the ResolutionEngine to the campaign/pledge store, so every
 * resolution path (campaign resolve endpoint, resolution routes, schedules,
 * oracle webhooks) reads and writes the same persisted data.
 */

import {
  IResolutionDataProvider,
  PledgeForResolution,
  ResolutionOutcome,
  ResolutionRefusedError,
} from "../oracle";
import { commemorativeService } from "../tokens";
import { getStore, Pledge, PledgeType, StoreSession } from "../database";

function now(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Translate a campaign's pledge type into the engine's calculation parameters
 */
function calculationParams(pledgeType: PledgeType): PledgeForResolution["calculationParams"] {
  switch (pledgeType.calculationType) {
    case "per_unit":
      return {
        perUnitAmount: pledgeType.perUnitAmount ?? undefined,
        unitField: pledgeType.unitField ?? undefined,
        cap: pledgeType.cap ?? undefined,
      };
    case "tiered":
      return {
        tiers: (pledgeType.tiers ?? []).map((t) => ({ threshold: t.threshold, rate: BigInt(t.rate) })),
        unitField: pledgeType.unitField ?? undefined,
        cap: pledgeType.cap ?? undefined,
      };
    case "conditional":
      return pledgeType.condition
        ? {
            conditionField: pledgeType.condition.field,
            conditionOperator: pledgeType.condition.operator,
            conditionValue: pledgeType.condition.value,
            conditionValueEnd: pledgeType.condition.valueEnd,
          }
        : undefined;
    default:
      return undefined;
  }
}

async function activePledges(session: StoreSession, campaignId: string): Promise<Pledge[]> {
  return (await session.listPledges({ campaignId, status: "active" })).items;
}

export class StoreResolutionDataProvider implements IResolutionDataProvider {
  async getCampaign(campaignId: string) {
    const campaign = await getStore().getCampaign(campaignId);
    if (!campaign) {
      return null;
    }

    return {
      id: campaign.id,
      status: campaign.status,
      beneficiary: campaign.beneficiary,
      resolutionDeadline: campaign.resolutionDeadline,
      pledgeWindowEnd: campaign.pledgeWindowEnd,
      milestones: campaign.milestones.map((m) => ({
        id: m.id,
        oracleId: m.oracleId,
        condition: m.condition,
        oracleParams: m.oracleParams,
        releasePercentage: m.releasePercentage,
        status: m.status,
        oracleData: m.oracleData,
      })),
    };
  }

  async getPledgesForCampaign(campaignId: string): Promise<PledgeForResolution[]> {
    const campaign = await getStore().getCampaign(campaignId);
    if (!campaign) {
      return [];
    }

    const pledgeTypes = new Map(campaign.pledgeTypes.map((pt) => [pt.id, pt]));
    return (await activePledges(getStore(), campaignId)).map((pledge) => {
      const pledgeType = pledgeTypes.get(pledge.pledgeTypeId);
      return {
        id: pledge.id,
        campaignId: pledge.campaignId,
        backer: pledge.backer,
        escrowedAmount: BigInt(pledge.escrowedAmount),
        pledgeType: pledgeType?.calculationType ?? "flat",
        calculationParams: pledgeType ? calculationParams(pledgeType) : undefined,
      };
    });
  }

  async commitResolution(outcome: ResolutionOutcome): Promise<void> {
    await getStore().transaction(async (tx) => {
      const campaign = await tx.getCampaign(outcome.campaignId, { forUpdate: true });
      if (!campaign) {
        throw new Error(`Campaign not found: ${outcome.campaignId}`);
      }
      // Re-checked under the lock: a concurrent resolution may have won
      if (campaign.status !== "active" && campaign.status !== "pledging_closed") {
        throw new ResolutionRefusedError("invalid_status", `Campaign was already ${campaign.status}`);
      }

      const resolvedAt = now();

      // The outcome must cover exactly the pledges that are still active
      const active = await activePledges(tx, campaign.id);
      const covered = new Set(outcome.pledges.map((p) => p.pledgeId));
      if (active.length !== covered.size || active.some((p) => !covered.has(p.id))) {
        throw new Error("Pledges changed while the campaign was being resolved");
      }

      for (const result of outcome.pledges) {
        const pledge = await tx.getPledge(result.pledgeId, { forUpdate: true });
        if (!pledge || pledge.status !== "active") {
          throw new Error(`Pledge ${result.pledgeId} is no longer active`);
        }
        pledge.status = "resolved";
        pledge.finalAmount = result.releaseAmount.toString();
        pledge.refundedAmount = result.refundAmount.toString();
        pledge.resolvedAt = resolvedAt;
        await tx.savePledge(pledge);
      }

      outcome.milestoneResults.forEach((result) => {
        const milestone = campaign.milestones.find((m) => m.id === result.milestoneId);
        if (!milestone) return;
        milestone.status = outcome.milestoneStatuses[milestone.id] ?? milestone.status;
        if (milestone.status === "verified" && milestone.verifiedAt === null) {
          milestone.verifiedAt = resolvedAt;
        }
        if (result.oracleData !== null && result.oracleData !== undefined) {
          milestone.oracleData = result.oracleData;
        }
      });

      const settled = outcome.totalReleased + outcome.totalRefunded;
      campaign.totalReleased = (BigInt(campaign.totalReleased) + outcome.totalReleased).toString();
      campaign.totalRefunded = (BigInt(campaign.totalRefunded) + outcome.totalRefunded).toString();
      campaign.totalEscrowed = (BigInt(campaign.totalEscrowed) - settled).toString();
      campaign.status = "resolved";
      campaign.resolvedAt = resolvedAt;
      campaign.updatedAt = resolvedAt;
      await tx.saveCampaign(campaign);
    });
  }

  async mintCommemorative(
    pledgeId: string,
    holder: string,
    campaignId: string,
    outcomeSummary: string
  ): Promise<void> {
    const store = getStore();
    const [campaign, pledge] = await Promise.all([
      store.getCampaign(campaignId),
      store.getPledge(pledgeId),
    ]);
    if (!campaign || !pledge) {
      throw new Error(`Cannot generate commemorative: pledge ${pledgeId} not found`);
    }

    const result = await commemorativeService.generateCommemorative({
      pledgeId,
      campaignId,
      campaignName: campaign.name,
      subjectName: campaign.subject?.name ?? campaign.beneficiaryName,
      beneficiaryName: campaign.beneficiaryName,
      backerName: pledge.backerName ?? holder,
      backerAddress: holder,
      contributionAmount: pledge.finalAmount ?? pledge.escrowedAmount,
      totalCampaignRaised: campaign.totalReleased,
      pledgedAt: pledge.createdAt,
      resolvedAt: pledge.resolvedAt ?? campaign.resolvedAt ?? now(),
      outcomeSummary,
    });
    if (!result.success || !result.record) {
      throw new Error(result.error ?? "Commemorative generation failed");
    }

    await store.transaction(async (tx) => {
      const current = await tx.getPledge(pledgeId, { forUpdate: true });
      if (current) {
        current.commemorativeId = result.record!.id;
        await tx.savePledge(current);
      }
    });
  }

  // The engine uses commitResolution when it is available, so these per-step
  // writes are never called; they exist to satisfy the interface.
  async resolvePledge(): Promise<void> {
    throw new Error("StoreResolutionDataProvider persists resolutions via commitResolution");
  }

  async updateCampaignStatus(): Promise<void> {
    throw new Error("StoreResolutionDataProvider persists resolutions via commitResolution");
  }
}
