import { Router, Request, Response } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { authMiddleware } from "../../security/middleware";
import { getCampaign } from "./campaigns";

const router = Router();

// In-memory storage for Phase 1
const pledges: Map<string, Pledge> = new Map();

interface Pledge {
  id: string;
  chainId: string | null;
  campaignId: string;
  pledgeTypeId: string;
  backer: string;
  backerName: string | null;
  escrowedAmount: string;
  finalAmount: string | null;
  status: PledgeStatus;
  createdAt: number;
  resolvedAt: number | null;
  tokenId: string | null;
  commemorativeId: string | null;
}

type PledgeStatus = "active" | "resolved" | "refunded" | "cancelled";

const createPledgeSchema = z.object({
  campaignId: z.string(),
  pledgeTypeId: z.string(),
  calculationParams: z.record(z.any()).optional(),
  backerName: z.string().nullable().optional(),
  transactionHash: z.string().optional(),
});

// Create pledge
router.post("/", authMiddleware(), async (req: Request, res: Response) => {
  try {
    const body = createPledgeSchema.parse(req.body);
    const now = Math.floor(Date.now() / 1000);

    const campaign = getCampaign(body.campaignId);
    if (!campaign) {
      return res.status(404).json({
        error: {
          code: "CAMPAIGN_NOT_FOUND",
          message: `Campaign with ID ${body.campaignId} does not exist`,
        },
      });
    }

    if (
      campaign.status !== "active" ||
      now < campaign.pledgeWindowStart ||
      now > campaign.pledgeWindowEnd
    ) {
      return res.status(409).json({
        error: {
          code: "CONFLICT",
          message: "Campaign is not accepting pledges",
        },
      });
    }

    const pledgeType = campaign.pledgeTypes.find((pt) => pt.id === body.pledgeTypeId);
    if (!pledgeType || !pledgeType.enabled) {
      return res.status(422).json({
        error: {
          code: "VALIDATION_ERROR",
          message: `Pledge type ${body.pledgeTypeId} is not available for this campaign`,
        },
      });
    }

    const rawAmount = body.calculationParams?.amount;
    if (typeof rawAmount !== "string" || !/^\d+$/.test(rawAmount) || BigInt(rawAmount) === 0n) {
      return res.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "calculationParams.amount must be a positive integer amount in wei",
        },
      });
    }
    const amount = BigInt(rawAmount);

    // Enforce the stricter of the campaign-wide and pledge-type bounds
    const minimums = [campaign.minimumPledge, pledgeType.minimum].map((v) => BigInt(v));
    const maximums = [campaign.maximumPledge, pledgeType.maximum]
      .filter((v): v is string => v !== null)
      .map((v) => BigInt(v));
    const minimum = minimums.reduce((a, b) => (a > b ? a : b));
    if (amount < minimum) {
      return res.status(422).json({
        error: {
          code: "VALIDATION_ERROR",
          message: `Pledge amount is below the minimum of ${minimum}`,
        },
      });
    }
    if (maximums.some((max) => amount > max)) {
      const maximum = maximums.reduce((a, b) => (a < b ? a : b));
      return res.status(422).json({
        error: {
          code: "VALIDATION_ERROR",
          message: `Pledge amount exceeds the maximum of ${maximum}`,
        },
      });
    }

    const id = `pledge_${uuidv4().slice(0, 8)}`;

    const pledge: Pledge = {
      id,
      chainId: null,
      campaignId: body.campaignId,
      pledgeTypeId: body.pledgeTypeId,
      backer: req.auth!.address,
      backerName: body.backerName || null,
      escrowedAmount: amount.toString(),
      finalAmount: null,
      status: "active",
      createdAt: now,
      resolvedAt: null,
      tokenId: `${Date.now()}`,
      commemorativeId: null,
    };

    pledges.set(id, pledge);

    campaign.totalEscrowed = (BigInt(campaign.totalEscrowed) + amount).toString();
    campaign.pledgeCount += 1;
    campaign.updatedAt = now;

    res.status(201).json({
      id: pledge.id,
      status: pledge.status,
      escrowedAmount: pledge.escrowedAmount,
      tokenId: pledge.tokenId,
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

// Get pledge
router.get("/:id", (req: Request, res: Response) => {
  const pledge = pledges.get(req.params.id);

  if (!pledge) {
    return res.status(404).json({
      error: {
        code: "PLEDGE_NOT_FOUND",
        message: `Pledge with ID ${req.params.id} does not exist`,
      },
    });
  }

  res.json({
    id: pledge.id,
    campaignId: pledge.campaignId,
    backer: pledge.backer,
    status: pledge.status,
    escrowedAmount: pledge.escrowedAmount,
    token: pledge.tokenId ? {
      tokenId: pledge.tokenId,
      imageUri: `https://api.pledgeprotocol.xyz/tokens/pledge/${pledge.tokenId}/image`,
    } : null,
  });
});

// Cancel pledge
router.delete("/:id", authMiddleware(), (req: Request, res: Response) => {
  const pledge = pledges.get(req.params.id);

  if (!pledge) {
    return res.status(404).json({
      error: {
        code: "PLEDGE_NOT_FOUND",
        message: `Pledge with ID ${req.params.id} does not exist`,
      },
    });
  }

  if (pledge.backer.toLowerCase() !== req.auth!.address.toLowerCase()) {
    return res.status(403).json({
      error: {
        code: "FORBIDDEN",
        message: "Only the backer can cancel this pledge",
      },
    });
  }

  if (pledge.status !== "active") {
    return res.status(409).json({
      error: {
        code: "CONFLICT",
        message: "Only active pledges can be cancelled",
      },
    });
  }

  // Mirrors PledgeManager.cancelPledge: cancellation only during the pledge window
  const now = Math.floor(Date.now() / 1000);
  const campaign = getCampaign(pledge.campaignId);
  if (!campaign || now < campaign.pledgeWindowStart || now > campaign.pledgeWindowEnd) {
    return res.status(409).json({
      error: {
        code: "CONFLICT",
        message: "Pledges can only be cancelled during the pledge window",
      },
    });
  }

  pledge.status = "cancelled";
  pledge.resolvedAt = now;

  const refunded = BigInt(pledge.escrowedAmount);
  campaign.totalEscrowed = (BigInt(campaign.totalEscrowed) - refunded).toString();
  campaign.totalRefunded = (BigInt(campaign.totalRefunded) + refunded).toString();
  campaign.pledgeCount -= 1;
  campaign.updatedAt = now;

  res.json({
    id: pledge.id,
    status: pledge.status,
    refundedAmount: pledge.escrowedAmount,
    refundTxHash: null, // Would be populated from blockchain
  });
});

// Get pledge token metadata (ERC-721 standard)
router.get("/:id/token", (req: Request, res: Response) => {
  const pledge = pledges.get(req.params.id);

  if (!pledge) {
    return res.status(404).json({
      error: {
        code: "PLEDGE_NOT_FOUND",
        message: `Pledge with ID ${req.params.id} does not exist`,
      },
    });
  }

  // Return ERC-721 metadata format
  res.json({
    name: `Pledge #${pledge.tokenId}`,
    description: `Active pledge for campaign ${pledge.campaignId}`,
    image: `https://api.pledgeprotocol.xyz/tokens/pledge/${pledge.tokenId}/image`,
    external_url: `https://pledgeprotocol.xyz/pledges/${pledge.id}`,
    attributes: [
      { trait_type: "Campaign", value: pledge.campaignId },
      { trait_type: "Status", value: pledge.status },
      { trait_type: "Escrowed", value: pledge.escrowedAmount },
      { trait_type: "Created", value: pledge.createdAt, display_type: "date" },
    ],
  });
});

// Get commemorative (after resolution)
router.get("/:id/commemorative", (req: Request, res: Response) => {
  const pledge = pledges.get(req.params.id);

  if (!pledge) {
    return res.status(404).json({
      error: {
        code: "PLEDGE_NOT_FOUND",
        message: `Pledge with ID ${req.params.id} does not exist`,
      },
    });
  }

  if (pledge.status !== "resolved") {
    return res.status(404).json({
      error: {
        code: "COMMEMORATIVE_NOT_FOUND",
        message: "Commemorative not available: pledge not resolved",
      },
    });
  }

  res.json({
    tokenId: pledge.commemorativeId,
    pledgeId: pledge.id,
    campaignId: pledge.campaignId,
    contributionAmount: pledge.finalAmount,
    imageUri: `https://api.pledgeprotocol.xyz/tokens/commemorative/${pledge.commemorativeId}/image`,
    metadataUri: `https://api.pledgeprotocol.xyz/tokens/commemorative/${pledge.commemorativeId}`,
  });
});

export default router;
