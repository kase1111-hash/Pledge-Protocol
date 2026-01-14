/**
 * Backer Routes
 * Phase 1 & 3: Backer pledge and commemorative queries
 */

import { Router, Request, Response } from "express";
import { commemorativeService, storageService } from "../../tokens";

const router = Router();

// Note: These routes would typically query the blockchain/database
// In Phase 1, we use in-memory storage which is shared with pledges route

// Get pledges for authenticated backer
router.get("/me/pledges", (req: Request, res: Response) => {
  const walletAddress = req.headers["x-wallet-address"] as string;

  if (!walletAddress) {
    return res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Wallet address required",
      },
    });
  }

  const { status } = req.query;

  // In production, this would query the database/blockchain
  // For Phase 1, return empty array (pledges are stored in pledges.ts)
  res.json({
    pledges: [],
    total: 0,
  });
});

// Get commemoratives for authenticated backer (Phase 3)
router.get("/me/commemoratives", (req: Request, res: Response) => {
  const walletAddress = req.headers["x-wallet-address"] as string;

  if (!walletAddress) {
    return res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Wallet address required",
      },
    });
  }

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
router.get("/:address/pledges", (req: Request, res: Response) => {
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

  // In production, query blockchain/database
  res.json({
    pledges: [],
    total: 0,
  });
});

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
