import { Router, Request, Response } from "express";

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

// Get commemoratives for authenticated backer
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

  // In production, this would query the blockchain for soulbound tokens
  res.json({
    commemoratives: [],
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

// Get commemoratives for any address
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

  // In production, query blockchain for soulbound tokens
  res.json({
    commemoratives: [],
  });
});

export default router;
