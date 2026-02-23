/**
 * Multi-Chain Deployment Service
 * Phase 8: Ecosystem Expansion - Deploy and manage campaigns across chains
 *
 * Uses ethers.js ContractFactory for real on-chain deployment.
 * Reads Hardhat artifacts for ABI and bytecode.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  JsonRpcProvider,
  Wallet,
  ContractFactory,
} from "ethers";
import {
  ChainId,
  ChainConfig,
  getChainConfig,
  isChainSupported,
  getEnabledChains,
} from "./config";
import {
  CampaignDeployment,
  multiChainRegistry,
} from "./registry";
import { logger, auditLogger } from "../security/audit-logger";
import { jobQueue } from "../infrastructure/job-queue";

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
 * Deployment configuration
 */
export interface DeploymentServiceConfig {
  rpcUrls: Record<number, string>;
  privateKey?: string;
  artifactsPath?: string; // Path to Hardhat artifacts
  blockConfirmations: number;
}

// ============================================================================
// HARDHAT ARTIFACT LOADER
// ============================================================================

interface HardhatArtifact {
  abi: any[];
  bytecode: string;
  contractName: string;
}

function loadArtifact(contractName: string, artifactsPath: string): HardhatArtifact {
  const artifactPath = join(
    artifactsPath,
    "contracts",
    `${contractName}.sol`,
    `${contractName}.json`
  );

  if (!existsSync(artifactPath)) {
    throw new Error(
      `Artifact not found for ${contractName}. Run 'npx hardhat compile' first. ` +
        `Expected at: ${artifactPath}`
    );
  }

  const raw = readFileSync(artifactPath, "utf-8");
  const artifact = JSON.parse(raw);

  if (!artifact.abi || !artifact.bytecode) {
    throw new Error(`Invalid artifact for ${contractName}: missing ABI or bytecode`);
  }

  return {
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    contractName,
  };
}

// ============================================================================
// DEPLOYMENT SERVICE
// ============================================================================

/**
 * Multi-Chain Deployment Service
 * Handles deployment of campaigns and contracts across multiple networks
 */
export class DeploymentService {
  private pendingDeployments: Map<string, DeploymentRequest> = new Map();
  private deploymentResults: Map<string, DeploymentResult> = new Map();
  private config: DeploymentServiceConfig;
  private providers: Map<number, JsonRpcProvider> = new Map();

  constructor(config?: DeploymentServiceConfig) {
    this.config = config || {
      rpcUrls: {},
      blockConfirmations: 2,
      artifactsPath: join(process.cwd(), "artifacts"),
    };
    this.initializeProviders();
  }

  private initializeProviders(): void {
    for (const [chainIdStr, rpcUrl] of Object.entries(this.config.rpcUrls)) {
      const chainId = parseInt(chainIdStr);
      this.providers.set(chainId, new JsonRpcProvider(rpcUrl));
    }
  }

  private getProvider(chainId: number): JsonRpcProvider {
    const provider = this.providers.get(chainId);
    if (!provider) {
      throw new Error(`No RPC provider configured for chain ${chainId}`);
    }
    return provider;
  }

  private getWallet(chainId: number): Wallet {
    if (!this.config.privateKey) {
      throw new Error("Deployment private key not configured");
    }
    return new Wallet(this.config.privateKey, this.getProvider(chainId));
  }

  /**
   * Estimate gas for campaign deployment using real RPC
   */
  async estimateDeploymentGas(
    chainId: ChainId,
    campaignData: DeploymentRequest["campaignData"]
  ): Promise<GasEstimate> {
    const config = getChainConfig(chainId);
    if (!config) {
      throw new Error(`Unsupported chain: ${chainId}`);
    }

    const provider = this.getProvider(chainId);

    // Get real gas price from the network
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || 0n;

    // Estimate deployment gas using the artifact bytecode
    const artifactsPath = this.config.artifactsPath || join(process.cwd(), "artifacts");

    try {
      const artifact = loadArtifact("CampaignRegistry", artifactsPath);
      const wallet = this.getWallet(chainId);
      const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);

      // Use estimateGas on the deployment transaction
      const deployTx = await factory.getDeployTransaction();
      const gasLimit = await provider.estimateGas({
        ...deployTx,
        from: wallet.address,
      });

      const estimatedCost = gasLimit * gasPrice;

      return {
        chainId,
        gasLimit,
        gasPrice,
        maxFeePerGas: config.features.supportsEIP1559
          ? feeData.maxFeePerGas || undefined
          : undefined,
        maxPriorityFeePerGas: config.features.supportsEIP1559
          ? feeData.maxPriorityFeePerGas || undefined
          : undefined,
        estimatedCost,
        nativeCurrency: config.nativeCurrency.symbol,
      };
    } catch (error) {
      // Fallback: estimate based on typical deployment size
      const gasLimit = 500000n + 50000n * BigInt(campaignData.milestones.length);
      const estimatedCost = gasLimit * gasPrice;

      return {
        chainId,
        gasLimit,
        gasPrice,
        maxFeePerGas: config.features.supportsEIP1559
          ? feeData.maxFeePerGas || undefined
          : undefined,
        maxPriorityFeePerGas: config.features.supportsEIP1559
          ? feeData.maxPriorityFeePerGas || undefined
          : undefined,
        estimatedCost,
        nativeCurrency: config.nativeCurrency.symbol,
      };
    }
  }

  /**
   * Deploy campaign to a chain using real ContractFactory
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
      logger.warn(`Protocol not deployed on chain ${chainId}, queuing deployment`);
      return {
        success: false,
        campaignId,
        chainId,
        error: `Protocol contracts not yet deployed on chain ${chainId}`,
      };
    }

    const deploymentId = `deploy-${Buffer.from(
      new Uint8Array(8).map(() => Math.floor(Math.random() * 256))
    ).toString("hex")}`;
    this.pendingDeployments.set(deploymentId, request);

    try {
      const result = await this.executeDeployment(deploymentId, request);

      if (result.success) {
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
   * Execute real on-chain contract deployment
   */
  private async executeDeployment(
    deploymentId: string,
    request: DeploymentRequest
  ): Promise<DeploymentResult> {
    const { campaignId, chainId, campaignData } = request;
    const artifactsPath = this.config.artifactsPath || join(process.cwd(), "artifacts");
    const wallet = this.getWallet(chainId);

    // Load the CampaignRegistry artifact
    const artifact = loadArtifact("CampaignRegistry", artifactsPath);
    const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);

    // Deploy the contract
    const contract = await factory.deploy();
    const deployTx = contract.deploymentTransaction();

    if (!deployTx) {
      throw new Error("Deployment transaction not available");
    }

    // Wait for confirmations
    const receipt = await deployTx.wait(this.config.blockConfirmations);

    if (!receipt || receipt.status === 0) {
      throw new Error("Contract deployment transaction reverted");
    }

    const contractAddress = await contract.getAddress();

    // Deploy EscrowVault linked to the campaign
    const escrowArtifact = loadArtifact("EscrowVault", artifactsPath);
    const escrowFactory = new ContractFactory(
      escrowArtifact.abi,
      escrowArtifact.bytecode,
      wallet
    );
    const escrowContract = await escrowFactory.deploy();
    const escrowTx = escrowContract.deploymentTransaction();

    if (escrowTx) {
      await escrowTx.wait(this.config.blockConfirmations);
    }

    const escrowAddress = await escrowContract.getAddress();

    return {
      success: true,
      campaignId,
      chainId,
      contractAddress,
      escrowAddress,
      transactionHash: deployTx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
      deploymentCost: receipt.gasUsed * (receipt.gasPrice || 0n),
    };
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

      if (!result.success) {
        logger.warn(`Deployment to chain ${chainId} failed: ${result.error}`);
      }
    }

    return results;
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
   * Verify contract deployment on chain using real RPC
   */
  async verifyDeployment(
    campaignId: string,
    chainId: ChainId
  ): Promise<{ verified: boolean; blockNumber?: number; error?: string }> {
    const deployment = multiChainRegistry.getCampaignDeployment(campaignId, chainId);

    if (!deployment) {
      return { verified: false, error: "Deployment not found in registry" };
    }

    try {
      const provider = this.getProvider(chainId);

      // Verify the contract has code at the address
      const code = await provider.getCode(deployment.contractAddress);

      if (code === "0x" || code === "0x0") {
        return {
          verified: false,
          error: "No contract code found at the registered address",
        };
      }

      // Verify the transaction exists
      const receipt = await provider.getTransactionReceipt(deployment.transactionHash);

      if (!receipt || receipt.status === 0) {
        return {
          verified: false,
          error: "Deployment transaction not found or reverted",
        };
      }

      return {
        verified: true,
        blockNumber: receipt.blockNumber,
      };
    } catch (error) {
      return {
        verified: false,
        error: `Verification failed: ${(error as Error).message}`,
      };
    }
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
