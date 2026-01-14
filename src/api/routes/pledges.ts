import { Router, Request, Response } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

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
router.post("/", async (req: Request, res: Response) => {
  try {
    const body = createPledgeSchema.parse(req.body);

    const id = `pledge_${uuidv4().slice(0, 8)}`;
    const now = Math.floor(Date.now() / 1000);

    const pledge: Pledge = {
      id,
      chainId: null,
      campaignId: body.campaignId,
      pledgeTypeId: body.pledgeTypeId,
      backer: req.headers["x-wallet-address"] as string || "0x0000000000000000000000000000000000000000",
      backerName: body.backerName || null,
      escrowedAmount: body.calculationParams?.amount || "0",
      finalAmount: null,
      status: "active",
      createdAt: now,
      resolvedAt: null,
      tokenId: `${Date.now()}`,
      commemorativeId: null,
    };

    pledges.set(id, pledge);

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
router.delete("/:id", (req: Request, res: Response) => {
  const pledge = pledges.get(req.params.id);

  if (!pledge) {
    return res.status(404).json({
      error: {
        code: "PLEDGE_NOT_FOUND",
        message: `Pledge with ID ${req.params.id} does not exist`,
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

  const now = Math.floor(Date.now() / 1000);
  pledge.status = "cancelled";
  pledge.resolvedAt = now;

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
