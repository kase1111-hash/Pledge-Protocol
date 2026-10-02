import { Router, Request, Response } from "express";
import { z } from "zod";
import { randomBytes } from "crypto";
import { v4 as uuidv4 } from "uuid";
import { authMiddleware, asyncHandler, sameAddress } from "../../security/middleware";
import { getStore, Pledge, PledgeStatus } from "../../database";

const router = Router();

function now(): number {
  return Math.floor(Date.now() / 1000);
}

const weiAmount = z.string().regex(/^0*[1-9]\d*$/, "Must be a positive integer amount in wei");

const createPledgeSchema = z
  .object({
    campaignId: z.string(),
    pledgeTypeId: z.string(),
    /** Amount to escrow, in wei */
    amount: weiAmount.optional(),
    /** Deprecated: pass `amount` instead */
    calculationParams: z.object({ amount: weiAmount.optional() }).passthrough().optional(),
    backerName: z.string().max(100).nullable().optional(),
    transactionHash: z.string().optional(),
  })
  .refine((body) => body.amount ?? body.calculationParams?.amount, {
    message: "amount is required",
    path: ["amount"],
  });

const pledgeStatuses: [PledgeStatus, ...PledgeStatus[]] = ["active", "resolved", "refunded", "cancelled"];

const listQuerySchema = z.object({
  campaignId: z.string().optional(),
  backer: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  status: z.enum(pledgeStatuses).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

function pledgeNotFound(res: Response, id: string) {
  return res.status(404).json({
    error: {
      code: "PLEDGE_NOT_FOUND",
      message: `Pledge with ID ${id} does not exist`,
    },
  });
}

function invalidRequest(res: Response, error: z.ZodError) {
  return res.status(400).json({
    error: {
      code: "INVALID_REQUEST",
      message: "Invalid request",
      details: error.errors,
    },
  });
}

function toResponse(pledge: Pledge) {
  return {
    id: pledge.id,
    campaignId: pledge.campaignId,
    pledgeTypeId: pledge.pledgeTypeId,
    backer: pledge.backer,
    backerName: pledge.backerName,
    status: pledge.status,
    escrowedAmount: pledge.escrowedAmount,
    finalAmount: pledge.finalAmount,
    refundedAmount: pledge.refundedAmount,
    createdAt: pledge.createdAt,
    resolvedAt: pledge.resolvedAt,
    commemorativeId: pledge.commemorativeId,
    token: pledge.tokenId ? {
      tokenId: pledge.tokenId,
      imageUri: `https://api.pledgeprotocol.xyz/tokens/pledge/${pledge.tokenId}/image`,
    } : null,
  };
}

// Create pledge
router.post("/", authMiddleware(), asyncHandler(async (req: Request, res: Response) => {
  const parsed = createPledgeSchema.safeParse(req.body);
  if (!parsed.success) {
    return invalidRequest(res, parsed.error);
  }
  const body = parsed.data;
  const amount = BigInt((body.amount ?? body.calculationParams?.amount)!);

  const result = await getStore().transaction(async (tx) => {
    const timestamp = now();

    // Locked so concurrent pledges cannot lose updates to the campaign totals
    const campaign = await tx.getCampaign(body.campaignId, { forUpdate: true });
    if (!campaign) {
      return () => res.status(404).json({
        error: {
          code: "CAMPAIGN_NOT_FOUND",
          message: `Campaign with ID ${body.campaignId} does not exist`,
        },
      });
    }

    if (
      campaign.status !== "active" ||
      timestamp < campaign.pledgeWindowStart ||
      timestamp > campaign.pledgeWindowEnd
    ) {
      return () => res.status(409).json({
        error: {
          code: "CONFLICT",
          message: "Campaign is not accepting pledges",
        },
      });
    }

    const pledgeType = campaign.pledgeTypes.find((pt) => pt.id === body.pledgeTypeId);
    if (!pledgeType || !pledgeType.enabled) {
      return () => res.status(422).json({
        error: {
          code: "VALIDATION_ERROR",
          message: `Pledge type ${body.pledgeTypeId} is not available for this campaign`,
        },
      });
    }

    // Enforce the stricter of the campaign-wide and pledge-type bounds
    const minimum = [campaign.minimumPledge, pledgeType.minimum]
      .map((v) => BigInt(v))
      .reduce((a, b) => (a > b ? a : b));
    const maximums = [campaign.maximumPledge, pledgeType.maximum]
      .filter((v): v is string => v !== null)
      .map((v) => BigInt(v));

    if (amount < minimum) {
      return () => res.status(422).json({
        error: {
          code: "VALIDATION_ERROR",
          message: `Pledge amount is below the minimum of ${minimum}`,
        },
      });
    }
    if (maximums.some((max) => amount > max)) {
      const maximum = maximums.reduce((a, b) => (a < b ? a : b));
      return () => res.status(422).json({
        error: {
          code: "VALIDATION_ERROR",
          message: `Pledge amount exceeds the maximum of ${maximum}`,
        },
      });
    }

    const pledge: Pledge = {
      id: `pledge_${uuidv4().slice(0, 8)}`,
      chainId: null,
      campaignId: campaign.id,
      pledgeTypeId: pledgeType.id,
      backer: req.auth!.address,
      backerName: body.backerName || null,
      escrowedAmount: amount.toString(),
      finalAmount: null,
      refundedAmount: null,
      status: "active",
      createdAt: timestamp,
      resolvedAt: null,
      tokenId: BigInt(`0x${randomBytes(8).toString("hex")}`).toString(),
      commemorativeId: null,
    };

    await tx.savePledge(pledge);

    campaign.totalEscrowed = (BigInt(campaign.totalEscrowed) + amount).toString();
    campaign.pledgeCount += 1;
    campaign.updatedAt = timestamp;
    await tx.saveCampaign(campaign);

    return () => res.status(201).json(toResponse(pledge));
  });

  result();
}));

// List pledges
router.get("/", asyncHandler(async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return invalidRequest(res, parsed.error);
  }
  const { limit, offset, ...filter } = parsed.data;

  const page = await getStore().listPledges({ ...filter, limit, offset });
  res.json({ pledges: page.items.map(toResponse), total: page.total, limit, offset });
}));

// Get pledge
router.get("/:id", asyncHandler(async (req: Request, res: Response) => {
  const pledge = await getStore().getPledge(req.params.id);

  if (!pledge) {
    return pledgeNotFound(res, req.params.id);
  }

  res.json(toResponse(pledge));
}));

// Cancel pledge
router.delete("/:id", authMiddleware(), asyncHandler(async (req: Request, res: Response) => {
  const result = await getStore().transaction(async (tx) => {
    const existing = await tx.getPledge(req.params.id);
    if (!existing) {
      return () => pledgeNotFound(res, req.params.id);
    }

    if (!sameAddress(existing.backer, req.auth!.address)) {
      return () => res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "Only the backer can cancel this pledge",
        },
      });
    }

    // Lock the campaign first, then the pledge, matching pledge creation and
    // resolution so concurrent operations cannot deadlock
    const campaign = await tx.getCampaign(existing.campaignId, { forUpdate: true });
    const pledge = await tx.getPledge(req.params.id, { forUpdate: true });

    if (!pledge || pledge.status !== "active") {
      return () => res.status(409).json({
        error: {
          code: "CONFLICT",
          message: "Only active pledges can be cancelled",
        },
      });
    }

    // Mirrors PledgeManager.cancelPledge: cancellation only during the pledge window
    const timestamp = now();
    if (!campaign || timestamp < campaign.pledgeWindowStart || timestamp > campaign.pledgeWindowEnd) {
      return () => res.status(409).json({
        error: {
          code: "CONFLICT",
          message: "Pledges can only be cancelled during the pledge window",
        },
      });
    }

    pledge.status = "cancelled";
    pledge.finalAmount = "0";
    pledge.refundedAmount = pledge.escrowedAmount;
    pledge.resolvedAt = timestamp;
    await tx.savePledge(pledge);

    const refunded = BigInt(pledge.escrowedAmount);
    campaign.totalEscrowed = (BigInt(campaign.totalEscrowed) - refunded).toString();
    campaign.totalRefunded = (BigInt(campaign.totalRefunded) + refunded).toString();
    campaign.pledgeCount -= 1;
    campaign.updatedAt = timestamp;
    await tx.saveCampaign(campaign);

    return () => res.json({
      id: pledge.id,
      status: pledge.status,
      refundedAmount: pledge.escrowedAmount,
      refundTxHash: null, // Would be populated from blockchain
    });
  });

  result();
}));

// Get pledge token metadata (ERC-721 standard)
router.get("/:id/token", asyncHandler(async (req: Request, res: Response) => {
  const pledge = await getStore().getPledge(req.params.id);

  if (!pledge) {
    return pledgeNotFound(res, req.params.id);
  }

  // Return ERC-721 metadata format
  res.json({
    name: `Pledge #${pledge.tokenId}`,
    description: `Pledge for campaign ${pledge.campaignId}`,
    image: `https://api.pledgeprotocol.xyz/tokens/pledge/${pledge.tokenId}/image`,
    external_url: `https://pledgeprotocol.xyz/pledges/${pledge.id}`,
    attributes: [
      { trait_type: "Campaign", value: pledge.campaignId },
      { trait_type: "Status", value: pledge.status },
      { trait_type: "Escrowed", value: pledge.escrowedAmount },
      { trait_type: "Created", value: pledge.createdAt, display_type: "date" },
    ],
  });
}));

// Get commemorative (after resolution)
router.get("/:id/commemorative", asyncHandler(async (req: Request, res: Response) => {
  const pledge = await getStore().getPledge(req.params.id);

  if (!pledge) {
    return pledgeNotFound(res, req.params.id);
  }

  if (pledge.status !== "resolved" || !pledge.commemorativeId) {
    return res.status(404).json({
      error: {
        code: "COMMEMORATIVE_NOT_FOUND",
        message: "Commemorative not available: pledge not resolved",
      },
    });
  }

  res.json({
    commemorativeId: pledge.commemorativeId,
    pledgeId: pledge.id,
    campaignId: pledge.campaignId,
    contributionAmount: pledge.finalAmount,
    imageUri: `https://api.pledgeprotocol.xyz/tokens/commemorative/${pledge.commemorativeId}/image`,
    metadataUri: `https://api.pledgeprotocol.xyz/tokens/commemorative/${pledge.commemorativeId}`,
  });
}));

export default router;
