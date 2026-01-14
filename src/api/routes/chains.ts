/**
 * Multi-Chain API Routes
 * Phase 8: Ecosystem Expansion - Chain management and cross-chain deployment
 */

import { Router, Request, Response } from "express";
import {
  getChainConfig,
  getEnabledChains,
  getMainnets,
  getTestnets,
  isChainSupported,
  ChainId,
} from "../../multichain/config";
import { multiChainRegistry } from "../../multichain/registry";
import { deploymentService } from "../../multichain/deployment-service";
import { authMiddleware, requirePermission } from "../../security/middleware";

const router = Router();

// ============================================================================
// CHAIN INFORMATION
// ============================================================================

/**
 * GET /chains
 * List all supported chains
 */
router.get("/", (_req: Request, res: Response) => {
  try {
    const chains = getEnabledChains();

    res.json({
      success: true,
      data: chains.map((c) => ({
        chainId: c.chainId,
        name: c.name,
        shortName: c.shortName,
        networkType: c.networkType,
        nativeCurrency: c.nativeCurrency,
        blockExplorer: c.blockExplorer,
        deployed: multiChainRegistry.isDeployedOnChain(c.chainId),
      })),
      count: chains.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /chains/mainnets
 * List mainnet chains
 */
router.get("/mainnets", (_req: Request, res: Response) => {
  try {
    const chains = getMainnets();

    res.json({
      success: true,
      data: chains.map((c) => ({
        chainId: c.chainId,
        name: c.name,
        shortName: c.shortName,
        deployed: multiChainRegistry.isDeployedOnChain(c.chainId),
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /chains/testnets
 * List testnet chains
 */
router.get("/testnets", (_req: Request, res: Response) => {
  try {
    const chains = getTestnets();

    res.json({
      success: true,
      data: chains.map((c) => ({
        chainId: c.chainId,
        name: c.name,
        shortName: c.shortName,
        deployed: multiChainRegistry.isDeployedOnChain(c.chainId),
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /chains/:chainId
 * Get chain details
 */
router.get("/:chainId", (req: Request, res: Response) => {
  try {
    const chainId = parseInt(req.params.chainId) as ChainId;

    if (!isChainSupported(chainId)) {
      res.status(404).json({
        success: false,
        error: "Chain not supported",
      });
      return;
    }

    const config = getChainConfig(chainId);
    const contracts = multiChainRegistry.getChainContracts(chainId);
    const campaigns = multiChainRegistry.getCampaignsOnChain(chainId);
    const health = multiChainRegistry.getChainHealth(chainId);

    res.json({
      success: true,
      data: {
        ...config,
        contracts: contracts.map((c) => ({
          type: c.contractType,
          address: c.address,
          version: c.version,
          verified: c.verified,
        })),
        campaignCount: campaigns.length,
        health: health || { healthy: true, lastChecked: null },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /chains/:chainId/contracts
 * Get contracts deployed on a chain
 */
router.get("/:chainId/contracts", (req: Request, res: Response) => {
  try {
    const chainId = parseInt(req.params.chainId) as ChainId;

    if (!isChainSupported(chainId)) {
      res.status(404).json({
        success: false,
        error: "Chain not supported",
      });
      return;
    }

    const contracts = multiChainRegistry.getChainContracts(chainId);

    res.json({
      success: true,
      data: contracts,
      count: contracts.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /chains/:chainId/campaigns
 * Get campaigns deployed on a chain
 */
router.get("/:chainId/campaigns", (req: Request, res: Response) => {
  try {
    const chainId = parseInt(req.params.chainId) as ChainId;

    if (!isChainSupported(chainId)) {
      res.status(404).json({
        success: false,
        error: "Chain not supported",
      });
      return;
    }

    const campaigns = multiChainRegistry.getCampaignsOnChain(chainId);

    res.json({
      success: true,
      data: campaigns,
      count: campaigns.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// ============================================================================
// DEPLOYMENT
// ============================================================================

/**
 * POST /chains/:chainId/estimate
 * Estimate gas for campaign deployment
 */
router.post("/:chainId/estimate", authMiddleware(), async (req: Request, res: Response) => {
  try {
    const chainId = parseInt(req.params.chainId) as ChainId;

    if (!isChainSupported(chainId)) {
      res.status(404).json({
        success: false,
        error: "Chain not supported",
      });
      return;
    }

    const estimate = await deploymentService.estimateDeploymentGas(chainId, req.body);

    res.json({
      success: true,
      data: {
        ...estimate,
        gasLimit: estimate.gasLimit.toString(),
        gasPrice: estimate.gasPrice.toString(),
        maxFeePerGas: estimate.maxFeePerGas?.toString(),
        maxPriorityFeePerGas: estimate.maxPriorityFeePerGas?.toString(),
        estimatedCost: estimate.estimatedCost.toString(),
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /chains/:chainId/deploy
 * Deploy campaign to a chain
 */
router.post(
  "/:chainId/deploy",
  authMiddleware(),
  requirePermission("campaign:create"),
  async (req: Request, res: Response) => {
    try {
      const chainId = parseInt(req.params.chainId) as ChainId;
      const { campaignId, campaignData } = req.body;

      if (!isChainSupported(chainId)) {
        res.status(404).json({
          success: false,
          error: "Chain not supported",
        });
        return;
      }

      const result = await deploymentService.deployCampaign({
        campaignId,
        chainId,
        creator: req.auth!.address,
        campaignData,
      });

      if (result.success) {
        res.status(201).json({
          success: true,
          data: {
            ...result,
            gasUsed: result.gasUsed?.toString(),
            deploymentCost: result.deploymentCost?.toString(),
          },
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
);

/**
 * POST /chains/deploy-multi
 * Deploy campaign to multiple chains
 */
router.post(
  "/deploy-multi",
  authMiddleware(),
  requirePermission("campaign:create"),
  async (req: Request, res: Response) => {
    try {
      const { campaignId, campaignData, chainIds } = req.body;

      if (!chainIds || !Array.isArray(chainIds) || chainIds.length === 0) {
        res.status(400).json({
          success: false,
          error: "chainIds array is required",
        });
        return;
      }

      const results = await deploymentService.deployToMultipleChains(
        campaignId,
        req.auth!.address,
        campaignData,
        chainIds
      );

      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      res.json({
        success: true,
        data: {
          results: results.map((r) => ({
            ...r,
            gasUsed: r.gasUsed?.toString(),
            deploymentCost: r.deploymentCost?.toString(),
          })),
          summary: {
            total: results.length,
            successful: successful.length,
            failed: failed.length,
          },
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
);

/**
 * GET /chains/recommended
 * Get recommended chains for deployment
 */
router.get("/recommended", (req: Request, res: Response) => {
  try {
    const { lowCost, fastConfirmation, mainnetOnly } = req.query;

    const chains = deploymentService.getRecommendedChains({
      lowCost: lowCost === "true",
      fastConfirmation: fastConfirmation === "true",
      mainnetOnly: mainnetOnly === "true",
    });

    res.json({
      success: true,
      data: chains.map((c) => ({
        chainId: c.chainId,
        name: c.name,
        shortName: c.shortName,
        networkType: c.networkType,
        avgBlockTime: c.features.avgBlockTime,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// ============================================================================
// CROSS-CHAIN
// ============================================================================

/**
 * GET /chains/campaigns/:campaignId
 * Get cross-chain campaign info
 */
router.get("/campaigns/:campaignId", (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;

    const deployments = multiChainRegistry.getCampaignDeployments(campaignId);

    if (deployments.length === 0) {
      res.status(404).json({
        success: false,
        error: "Campaign not deployed to any chain",
      });
      return;
    }

    const crossChain = multiChainRegistry.getCrossChainCampaign(campaignId);

    res.json({
      success: true,
      data: {
        ...crossChain,
        totalPledgedAllChains: crossChain?.totalPledgedAllChains.toString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * GET /chains/stats
 * Get multi-chain statistics
 */
router.get("/stats", (_req: Request, res: Response) => {
  try {
    const registryStats = multiChainRegistry.getStatistics();
    const deploymentStats = deploymentService.getStatistics();

    res.json({
      success: true,
      data: {
        registry: registryStats,
        deployments: deploymentStats,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

export default router;
