/**
 * Backer Routes
 * Phase 1 & 3: Backer pledge and commemorative queries
 */

import { Router, Request, Response } from "express";
import { commemorativeService, storageService } from "../../tokens";
import { authMiddleware, asyncHandler } from "../../security/middleware";
import { getStore, PledgeStatus } from "../../database";

const router = Router();

const pledgeStatuses: PledgeStatus[] = ["active", "resolved", "refunded", "cancelled"];

/**
 * Pledges made by an address, optionally filtered by ?status=
 */
async function pledgesFor(address: string, req: Request, res: Response) {
  const status = req.query.status as PledgeStatus | undefined;
  if (status !== undefined && !pledgeStatuses.includes(status)) {
    return res.status(400).json({
      error: { code: "INVALID_REQUEST", message: `status must be one of: ${pledgeStatuses.join(", ")}` },
    });
  }

  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "50"), 10) || 50, 1), 100);
  const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
  const page = await getStore().listPledges({ backer: address, status, limit, offset });

  res.json({
    pledges: page.items,
    total: page.total,
    limit,
    offset,
  });
}

// Get pledges for authenticated backer
router.get("/me/pledges", authMiddleware(), asyncHandler(async (req: Request, res: Response) => {
  await pledgesFor(req.auth!.address, req, res);
}));

// Get commemoratives for authenticated backer (Phase 3)
router.get("/me/commemoratives", authMiddleware(), (req: Request, res: Response) => {
  const walletAddress = req.auth!.address;

  // Query commemoratives by backer address
  const records = commemorativeService.getByBackerAddress(walletAddress);

  res.json({
    address: walletAddress,
    count: records.length,
    commemoratives: records.map(r => ({
      id: r.id,
      pledgeId: r.pledgeId,
      campaignId: r.campaignId,
      name: r.metadata.name,
      description: r.metadata.description,
      imageUrl: storageService.toHttpUrl(r.imageUri),
      metadataUrl: storageService.toHttpUrl(r.metadataUri),
      attributes: r.metadata.attributes,
      minted: r.minted,
      tokenId: r.tokenId,
      createdAt: r.createdAt,
      mintedAt: r.mintedAt
    }))
  });
});

// Get pledges for any address
router.get("/:address/pledges", asyncHandler(async (req: Request, res: Response) => {
  const { address } = req.params;

  // Validate address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid wallet address format",
      },
    });
  }

  await pledgesFor(address, req, res);
}));

// Get commemoratives for any address (Phase 3)
router.get("/:address/commemoratives", (req: Request, res: Response) => {
  const { address } = req.params;

  // Validate address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid wallet address format",
      },
    });
  }

  // Query commemoratives by backer address
  const records = commemorativeService.getByBackerAddress(address);

  res.json({
    address,
    count: records.length,
    commemoratives: records.map(r => ({
      id: r.id,
      pledgeId: r.pledgeId,
      campaignId: r.campaignId,
      name: r.metadata.name,
      description: r.metadata.description,
      imageUrl: storageService.toHttpUrl(r.imageUri),
      metadataUrl: storageService.toHttpUrl(r.metadataUri),
      attributes: r.metadata.attributes,
      minted: r.minted,
      tokenId: r.tokenId,
      createdAt: r.createdAt,
      mintedAt: r.mintedAt
    }))
  });
});

export default router;
