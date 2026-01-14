/**
 * Multi-Chain Registry
 * Phase 8: Ecosystem Expansion - Track contract deployments across chains
 */

import { ChainId, getChainConfig, isChainSupported } from "./config";

/**
 * Contract types in the protocol
 */
export type ContractType =
  | "CampaignRegistry"
  | "EscrowVault"
  | "PledgeManager"
  | "OracleRegistry"
  | "PledgeToken"
  | "CommemorativeToken"
  | "CampaignFactory";

/**
 * Deployment record for a contract
 */
export interface ContractDeployment {
  contractType: ContractType;
  chainId: ChainId;
  address: string;
  deployedAt: number;
  deployedBy: string;
  transactionHash: string;
  blockNumber: number;
  version: string;
  verified: boolean;
  proxyAddress?: string; // If using upgradeable proxy
  implementationAddress?: string;
}

/**
 * Campaign deployment record
 */
export interface CampaignDeployment {
  campaignId: string;
  chainId: ChainId;
  contractAddress: string;
  escrowAddress: string;
  deployedAt: number;
  deployedBy: string;
  transactionHash: string;
  blockNumber: number;
  active: boolean;
}

/**
 * Cross-chain campaign mapping
 */
export interface CrossChainCampaign {
  campaignId: string;
  primaryChainId: ChainId;
  deployments: CampaignDeployment[];
  totalPledgedAllChains: bigint;
  backerCountAllChains: number;
}

/**
 * Multi-Chain Registry Service
 * Tracks all contract deployments and provides chain-agnostic lookups
 */
export class MultiChainRegistry {
  private contracts: Map<string, ContractDeployment> = new Map();
  private campaigns: Map<string, CampaignDeployment[]> = new Map();
  private chainStatus: Map<ChainId, { healthy: boolean; lastChecked: number }> = new Map();

  /**
   * Register a core contract deployment
   */
  registerContract(deployment: ContractDeployment): void {
    const key = `${deployment.chainId}:${deployment.contractType}`;
    this.contracts.set(key, deployment);
  }

  /**
   * Get contract address for a chain
   */
  getContractAddress(chainId: ChainId, contractType: ContractType): string | undefined {
    const key = `${chainId}:${contractType}`;
    return this.contracts.get(key)?.address;
  }

  /**
   * Get all contract deployments for a chain
   */
  getChainContracts(chainId: ChainId): ContractDeployment[] {
    return Array.from(this.contracts.values()).filter((c) => c.chainId === chainId);
  }

  /**
   * Check if protocol is deployed on chain
   */
  isDeployedOnChain(chainId: ChainId): boolean {
    const required: ContractType[] = [
      "CampaignRegistry",
      "EscrowVault",
      "PledgeManager",
    ];

    return required.every((type) => this.getContractAddress(chainId, type) !== undefined);
  }

  /**
   * Get all chains with deployments
   */
  getDeployedChains(): ChainId[] {
    const chains = new Set<ChainId>();
    for (const deployment of this.contracts.values()) {
      chains.add(deployment.chainId);
    }
    return Array.from(chains);
  }

  // ============================================================================
  // CAMPAIGN MANAGEMENT
  // ============================================================================

  /**
   * Register a campaign deployment on a chain
   */
  registerCampaignDeployment(deployment: CampaignDeployment): void {
    const existing = this.campaigns.get(deployment.campaignId) || [];

    // Check for duplicate chain deployment
    const existingOnChain = existing.find((d) => d.chainId === deployment.chainId);
    if (existingOnChain) {
      throw new Error(
        `Campaign ${deployment.campaignId} already deployed on chain ${deployment.chainId}`
      );
    }

    existing.push(deployment);
    this.campaigns.set(deployment.campaignId, existing);
  }

  /**
   * Get campaign deployment on a specific chain
   */
  getCampaignDeployment(
    campaignId: string,
    chainId: ChainId
  ): CampaignDeployment | undefined {
    const deployments = this.campaigns.get(campaignId);
    return deployments?.find((d) => d.chainId === chainId);
  }

  /**
   * Get all deployments for a campaign
   */
  getCampaignDeployments(campaignId: string): CampaignDeployment[] {
    return this.campaigns.get(campaignId) || [];
  }

  /**
   * Get campaigns deployed on a chain
   */
  getCampaignsOnChain(chainId: ChainId): CampaignDeployment[] {
    const result: CampaignDeployment[] = [];
    for (const deployments of this.campaigns.values()) {
      const onChain = deployments.find((d) => d.chainId === chainId);
      if (onChain) {
        result.push(onChain);
      }
    }
    return result;
  }

  /**
   * Get primary chain for a campaign
   */
  getPrimaryChain(campaignId: string): ChainId | undefined {
    const deployments = this.campaigns.get(campaignId);
    if (!deployments || deployments.length === 0) return undefined;

    // Primary is the first deployment
    return deployments.sort((a, b) => a.deployedAt - b.deployedAt)[0].chainId;
  }

  /**
   * Get cross-chain campaign summary
   */
  getCrossChainCampaign(campaignId: string): CrossChainCampaign | undefined {
    const deployments = this.campaigns.get(campaignId);
    if (!deployments || deployments.length === 0) return undefined;

    const primaryChainId = this.getPrimaryChain(campaignId);
    if (!primaryChainId) return undefined;

    return {
      campaignId,
      primaryChainId,
      deployments: deployments.sort((a, b) => a.deployedAt - b.deployedAt),
      totalPledgedAllChains: BigInt(0), // Would be aggregated from chain queries
      backerCountAllChains: 0,
    };
  }

  /**
   * Deactivate campaign on a chain
   */
  deactivateCampaignOnChain(campaignId: string, chainId: ChainId): boolean {
    const deployments = this.campaigns.get(campaignId);
    if (!deployments) return false;

    const deployment = deployments.find((d) => d.chainId === chainId);
    if (!deployment) return false;

    deployment.active = false;
    return true;
  }

  // ============================================================================
  // CHAIN HEALTH
  // ============================================================================

  /**
   * Update chain health status
   */
  updateChainHealth(chainId: ChainId, healthy: boolean): void {
    this.chainStatus.set(chainId, {
      healthy,
      lastChecked: Date.now(),
    });
  }

  /**
   * Get chain health status
   */
  getChainHealth(chainId: ChainId): { healthy: boolean; lastChecked: number } | undefined {
    return this.chainStatus.get(chainId);
  }

  /**
   * Get healthy chains
   */
  getHealthyChains(): ChainId[] {
    return Array.from(this.chainStatus.entries())
      .filter(([_, status]) => status.healthy)
      .map(([chainId]) => chainId);
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get registry statistics
   */
  getStatistics(): {
    totalContracts: number;
    totalCampaigns: number;
    deployedChains: number;
    contractsByChain: Record<number, number>;
    campaignsByChain: Record<number, number>;
  } {
    const contractsByChain: Record<number, number> = {};
    const campaignsByChain: Record<number, number> = {};

    for (const deployment of this.contracts.values()) {
      contractsByChain[deployment.chainId] =
        (contractsByChain[deployment.chainId] || 0) + 1;
    }

    for (const deployments of this.campaigns.values()) {
      for (const deployment of deployments) {
        campaignsByChain[deployment.chainId] =
          (campaignsByChain[deployment.chainId] || 0) + 1;
      }
    }

    return {
      totalContracts: this.contracts.size,
      totalCampaigns: this.campaigns.size,
      deployedChains: this.getDeployedChains().length,
      contractsByChain,
      campaignsByChain,
    };
  }

  /**
   * Export registry data for backup
   */
  export(): {
    contracts: ContractDeployment[];
    campaigns: { campaignId: string; deployments: CampaignDeployment[] }[];
  } {
    return {
      contracts: Array.from(this.contracts.values()),
      campaigns: Array.from(this.campaigns.entries()).map(([campaignId, deployments]) => ({
        campaignId,
        deployments,
      })),
    };
  }

  /**
   * Import registry data from backup
   */
  import(data: {
    contracts: ContractDeployment[];
    campaigns: { campaignId: string; deployments: CampaignDeployment[] }[];
  }): void {
    for (const contract of data.contracts) {
      this.registerContract(contract);
    }

    for (const { campaignId, deployments } of data.campaigns) {
      this.campaigns.set(campaignId, deployments);
    }
  }
}

// Export singleton instance
export const multiChainRegistry = new MultiChainRegistry();
