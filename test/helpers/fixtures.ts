/**
 * Builders for stored campaign and pledge records
 */

import { parseEther } from "ethers";
import { Campaign, Milestone, Pledge } from "../../src/database";

export const DAY = 24 * 3600;
export const nowSeconds = () => Math.floor(Date.now() / 1000);

export function milestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: "milestone_0",
    name: "Finish",
    description: "",
    oracleId: "oracle_1",
    oracleParams: {},
    condition: { type: "completion", field: "completed", operator: "eq", value: true },
    releasePercentage: 100,
    status: "pending",
    verifiedAt: null,
    oracleData: null,
    ...overrides,
  };
}

/** An active public campaign whose pledge window is open */
export function campaign(overrides: Partial<Campaign> = {}): Campaign {
  const now = nowSeconds();
  return {
    id: "campaign_1",
    chainId: null,
    name: "Marathon",
    description: "",
    creator: "0x00000000000000000000000000000000000000c1",
    beneficiary: "0x00000000000000000000000000000000000000b1",
    beneficiaryName: "Charity",
    subject: null,
    pledgeWindowStart: now - 10 * DAY,
    pledgeWindowEnd: now + 10 * DAY,
    eventDate: null,
    resolutionDeadline: now + 20 * DAY,
    milestones: [milestone()],
    pledgeTypes: [
      {
        id: "pt_0",
        name: "Flat",
        description: "",
        calculationType: "flat",
        baseAmount: null,
        perUnitAmount: null,
        unitField: null,
        cap: null,
        tiers: null,
        condition: null,
        minimum: "1",
        maximum: null,
        enabled: true,
      },
    ],
    minimumPledge: "1",
    maximumPledge: null,
    status: "active",
    totalEscrowed: "0",
    totalReleased: "0",
    totalRefunded: "0",
    pledgeCount: 0,
    visibility: "public",
    metadataUri: "",
    createdAt: now - 10 * DAY,
    updatedAt: now - 10 * DAY,
    resolvedAt: null,
    ...overrides,
  };
}

/** An active 1 ETH pledge */
export function pledge(overrides: Partial<Pledge> = {}): Pledge {
  return {
    id: "pledge_1",
    chainId: null,
    campaignId: "campaign_1",
    pledgeTypeId: "pt_0",
    backer: "0x00000000000000000000000000000000000000a1",
    backerName: null,
    escrowedAmount: parseEther("1").toString(),
    finalAmount: null,
    refundedAmount: null,
    status: "active",
    createdAt: nowSeconds() - 8 * DAY,
    resolvedAt: null,
    tokenId: null,
    commemorativeId: null,
    ...overrides,
  };
}
