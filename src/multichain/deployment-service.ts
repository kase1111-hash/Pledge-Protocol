/**
 * Multi-Chain Deployment Service
 * Phase 8: Ecosystem Expansion - Deploy and manage campaigns across chains
 */

import { randomBytes } from "crypto";
import {
  ChainId,
  ChainConfig,
  getChainConfig,
  isChainSupported,
  getEnabledChains,
  DEFAULT_CHAIN_ID,
} from "./config";
import {
  ContractDeployment,
  CampaignDeployment,
  ContractType,
  multiChainRegistry,
} from "./registry";
import { logger, auditLogger } from "../security/audit-logger";
import { jobQueue, JOB_TYPES } from "../infrastructure/job-queue";

/**
 * Deployment request for a campaign
 */
export interface DeploymentRequest {
  campaignId: string;
  chainId: ChainId;
  creator: string;
  campaignData: {
    name: string;
    description: string;
    beneficiary: string;
    goalAmount: bigint;
    deadline: number;
    milestones: Array<{
      name: string;
      targetDate: number;
      oracleId: string;
    }>;
  };
}

/**
 * Deployment result
 */
export interface DeploymentResult {
  success: boolean;
  campaignId: string;
  chainId: ChainId;
  contractAddress?: string;
  escrowAddress?: string;
  transactionHash?: string;
  blockNumber?: number;
  error?: string;
  gasUsed?: bigint;
  deploymentCost?: bigint;
}

/**
 * Gas estimation result
 */
export interface GasEstimate {
  chainId: ChainId;
  gasLimit: bigint;
  gasPrice: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  estimatedCost: bigint;
  nativeCurrency: string;
}

/**
 * Multi-Chain Deployment Service
 * Handles deployment of campaigns and contracts across multiple networks
 */
export class DeploymentService {
  private pendingDeployments: Map<string, DeploymentRequest> = new Map();
  private deploymentResults: Map<string, DeploymentResult> = new Map();

  /**
   * Estimate gas for campaign deployment
   */
  async estimateDeploymentGas(
    chainId: ChainId,
    campaignData: DeploymentRequest["campaignData"]
  ): Promise<GasEstimate> {
    const config = getChainConfig(chainId);
    if (!config) {
      throw new Error(`Unsupported chain: ${chainId}`);
    }

    // Base gas estimates (would be calculated from actual contract in production)
    const baseGas = BigInt(500000); // Campaign creation
    const milestoneGas = BigInt(50000) * BigInt(campaignData.milestones.length);
    const gasLimit = baseGas + milestoneGas;

    // Simulated gas prices (would query RPC in production)
    const gasPrices: Record<ChainId, bigint> = {
      1: BigInt(30000000000), // 30 gwei
      11155111: BigInt(5000000000), // 5 gwei
      137: BigInt(50000000000), // 50 gwei MATIC
      80001: BigInt(5000000000),
      42161: BigInt(100000000), // 0.1 gwei
      421614: BigInt(100000000),
      10: BigInt(1000000), // 0.001 gwei
      11155420: BigInt(1000000),
      8453: BigInt(1000000),
      84532: BigInt(1000000),
      5: BigInt(5000000000),
      31337: BigInt(1000000000),
    };

    const gasPrice = gasPrices[chainId] || BigInt(10000000000);
    const estimatedCost = gasLimit * gasPrice;

    return {
      chainId,
      gasLimit,
      gasPrice,
      maxFeePerGas: config.features.supportsEIP1559 ? gasPrice * BigInt(2) : undefined,
      maxPriorityFeePerGas: config.features.supportsEIP1559
        ? BigInt(1000000000)
        : undefined,
      estimatedCost,
      nativeCurrency: config.nativeCurrency.symbol,
    };
  }

  /**
   * Deploy campaign to a chain
   */
  async deployCampaign(request: DeploymentRequest): Promise<DeploymentResult> {
    const { campaignId, chainId, creator, campaignData } = request;

    // Validate chain
    if (!isChainSupported(chainId)) {
      return {
        success: false,
        campaignId,
        chainId,
        error: `Unsupported chain: ${chainId}`,
      };
    }

    // Check if already deployed on this chain
    const existing = multiChainRegistry.getCampaignDeployment(campaignId, chainId);
    if (existing) {
      return {
        success: false,
        campaignId,
        chainId,
        error: `Campaign already deployed on chain ${chainId}`,
        contractAddress: existing.contractAddress,
      };
    }

    // Check if protocol contracts are deployed
    if (!multiChainRegistry.isDeployedOnChain(chainId)) {
      // Queue contract deployment first
      logger.warn(`Protocol not deployed on chain ${chainId}, queuing deployment`);

      return {
        success: false,
        campaignId,
        chainId,
        error: `Protocol contracts not yet deployed on chain ${chainId}`,
      };
    }

    // Store pending deployment
    const deploymentId = `deploy-${randomBytes(8).toString("hex")}`;
    this.pendingDeployments.set(deploymentId, request);

    try {
      // In production, this would interact with actual blockchain
      // For now, simulate deployment
      const result = await this.simulateDeployment(deploymentId, request);

      if (result.success) {
        // Register deployment
        const deployment: CampaignDeployment = {
          campaignId,
          chainId,
          contractAddress: result.contractAddress!,
          escrowAddress: result.escrowAddress!,
          deployedAt: Date.now(),
          deployedBy: creator,
          transactionHash: result.transactionHash!,
          blockNumber: result.blockNumber!,
          active: true,
        };

        multiChainRegistry.registerCampaignDeployment(deployment);

        auditLogger.success(
          "campaign_deployed",
          { type: "user", address: creator },
          { type: "campaign", id: campaignId },
          { chainId, contractAddress: result.contractAddress }
        );
      }

      this.deploymentResults.set(deploymentId, result);
      return result;
    } catch (error) {
      const result: DeploymentResult = {
        success: false,
        campaignId,
        chainId,
        error: (error as Error).message,
      };

      this.deploymentResults.set(deploymentId, result);

      auditLogger.failure(
        "campaign_deployed",
        { type: "user", address: creator },
        { type: "campaign", id: campaignId },
        { chainId },
        (error as Error).message
      );

      return result;
    } finally {
      this.pendingDeployments.delete(deploymentId);
    }
  }

  /**
   * Deploy campaign to multiple chains
   */
  async deployToMultipleChains(
    campaignId: string,
    creator: string,
    campaignData: DeploymentRequest["campaignData"],
    chainIds: ChainId[]
  ): Promise<DeploymentResult[]> {
    const results: DeploymentResult[] = [];

    for (const chainId of chainIds) {
      const result = await this.deployCampaign({
        campaignId,
        chainId,
        creator,
        campaignData,
      });
      results.push(result);

      // Continue even if one chain fails
      if (!result.success) {
        logger.warn(`Deployment to chain ${chainId} failed: ${result.error}`);
      }
    }

    return results;
  }

  /**
   * Simulate deployment (for testing/development)
   */
  private async simulateDeployment(
    deploymentId: string,
    request: DeploymentRequest
  ): Promise<DeploymentResult> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Generate deterministic addresses based on deployment
    const contractAddress = `0x${randomBytes(20).toString("hex")}`;
    const escrowAddress = `0x${randomBytes(20).toString("hex")}`;
    const transactionHash = `0x${randomBytes(32).toString("hex")}`;

    return {
      success: true,
      campaignId: request.campaignId,
      chainId: request.chainId,
      contractAddress,
      escrowAddress,
      transactionHash,
      blockNumber: Math.floor(Date.now() / 1000),
      gasUsed: BigInt(450000),
      deploymentCost: BigInt(450000) * BigInt(10000000000),
    };
  }

  /**
   * Queue deployment job for background processing
   */
  queueDeployment(request: DeploymentRequest): string {
    const job = jobQueue.addJob(
      "campaign:deploy",
      request,
      { priority: "high" }
    );

    return job.id;
  }

  /**
   * Get deployment status
   */
  getDeploymentStatus(deploymentId: string): DeploymentResult | undefined {
    return this.deploymentResults.get(deploymentId);
  }

  /**
   * Get recommended chains for a campaign
   */
  getRecommendedChains(options?: {
    lowCost?: boolean;
    fastConfirmation?: boolean;
    mainnetOnly?: boolean;
  }): ChainConfig[] {
    let chains = getEnabledChains();

    if (options?.mainnetOnly) {
      chains = chains.filter((c) => c.networkType === "mainnet");
    }

    if (options?.lowCost) {
      // Prioritize L2s
      chains = chains.sort((a, b) => {
        const l2Priority: Record<ChainId, number> = {
          42161: 1, // Arbitrum
          10: 2, // Optimism
          8453: 3, // Base
          137: 4, // Polygon
          1: 10, // Ethereum (most expensive)
        } as Record<ChainId, number>;
        return (l2Priority[a.chainId] || 5) - (l2Priority[b.chainId] || 5);
      });
    }

    if (options?.fastConfirmation) {
      chains = chains.sort((a, b) => a.features.avgBlockTime - b.features.avgBlockTime);
    }

    return chains;
  }

  /**
   * Verify contract deployment on chain
   */
  async verifyDeployment(
    campaignId: string,
    chainId: ChainId
  ): Promise<{ verified: boolean; blockNumber?: number; error?: string }> {
    const deployment = multiChainRegistry.getCampaignDeployment(campaignId, chainId);

    if (!deployment) {
      return { verified: false, error: "Deployment not found in registry" };
    }

    // In production, would query the blockchain to verify contract exists
    // For now, trust the registry
    return {
      verified: true,
      blockNumber: deployment.blockNumber,
    };
  }

  /**
   * Get deployment statistics
   */
  getStatistics(): {
    pendingDeployments: number;
    completedDeployments: number;
    failedDeployments: number;
    byChain: Record<number, { success: number; failed: number }>;
  } {
    const byChain: Record<number, { success: number; failed: number }> = {};

    let completedDeployments = 0;
    let failedDeployments = 0;

    for (const result of this.deploymentResults.values()) {
      if (result.success) {
        completedDeployments++;
        if (!byChain[result.chainId]) {
          byChain[result.chainId] = { success: 0, failed: 0 };
        }
        byChain[result.chainId].success++;
      } else {
        failedDeployments++;
        if (!byChain[result.chainId]) {
          byChain[result.chainId] = { success: 0, failed: 0 };
        }
        byChain[result.chainId].failed++;
      }
    }

    return {
      pendingDeployments: this.pendingDeployments.size,
      completedDeployments,
      failedDeployments,
      byChain,
    };
  }
}

// Export singleton instance
export const deploymentService = new DeploymentService();
