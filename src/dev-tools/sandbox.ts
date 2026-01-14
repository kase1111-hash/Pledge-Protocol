/**
 * Phase 9: Local Sandbox Environment
 *
 * Local development environment with mock blockchain,
 * oracles, and test data.
 */

import { randomUUID } from "crypto";
import {
  SandboxConfig,
  SandboxState,
  SandboxAccount,
  SandboxContract,
  SandboxCampaign,
  SandboxMilestone,
  SandboxPledge,
} from "./types";

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  port: 8545,
  chainId: 31337,
  autoMine: true,
  blockTime: 1,
  accountsCount: 20,
  initialBalance: "10000000000000000000000", // 10,000 ETH
  mockOracles: true,
  seedData: true,
};

// ============================================================================
// SANDBOX ENVIRONMENT
// ============================================================================

export class Sandbox {
  private config: SandboxConfig;
  private state: SandboxState;
  private mockOracleResponses: Map<string, any> = new Map();

  constructor(config: Partial<SandboxConfig> = {}) {
    this.config = { ...DEFAULT_SANDBOX_CONFIG, ...config };
    this.state = this.initializeState();
  }

  private initializeState(): SandboxState {
    return {
      running: false,
      port: this.config.port,
      chainId: this.config.chainId,
      accounts: this.generateAccounts(),
      contracts: [],
      campaigns: [],
      pledges: [],
      blockNumber: 0,
      timestamp: Date.now(),
    };
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  async start(): Promise<SandboxState> {
    if (this.state.running) {
      throw new Error("Sandbox is already running");
    }

    this.state.running = true;
    this.state.timestamp = Date.now();

    // Deploy contracts
    await this.deployContracts();

    // Seed test data
    if (this.config.seedData) {
      await this.seedData();
    }

    // Start auto-mining
    if (this.config.autoMine) {
      this.startAutoMining();
    }

    return this.getState();
  }

  async stop(): Promise<void> {
    if (!this.state.running) {
      throw new Error("Sandbox is not running");
    }

    this.state.running = false;
  }

  async reset(): Promise<SandboxState> {
    this.state = this.initializeState();
    return this.start();
  }

  getState(): SandboxState {
    return { ...this.state };
  }

  // ==========================================================================
  // ACCOUNTS
  // ==========================================================================

  private generateAccounts(): SandboxAccount[] {
    const accounts: SandboxAccount[] = [];
    const labels = [
      "Deployer",
      "Creator 1",
      "Creator 2",
      "Beneficiary 1",
      "Beneficiary 2",
      "Backer 1",
      "Backer 2",
      "Backer 3",
      "Backer 4",
      "Backer 5",
      "Oracle",
      "Admin",
    ];

    for (let i = 0; i < this.config.accountsCount; i++) {
      const privateKey = `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f${i
        .toString(16)
        .padStart(4, "0")}`;
      const address = this.deriveAddress(privateKey, i);

      accounts.push({
        address,
        privateKey,
        balance: this.config.initialBalance,
        nonce: 0,
        label: labels[i] || `Account ${i + 1}`,
      });
    }

    return accounts;
  }

  private deriveAddress(privateKey: string, index: number): string {
    // Simplified address derivation (in production: use ethers.js)
    const base = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const suffix = index.toString(16).padStart(4, "0");
    return base.slice(0, -4) + suffix;
  }

  getAccounts(): SandboxAccount[] {
    return [...this.state.accounts];
  }

  getAccount(index: number): SandboxAccount | undefined {
    return this.state.accounts[index];
  }

  getAccountByLabel(label: string): SandboxAccount | undefined {
    return this.state.accounts.find((a) => a.label === label);
  }

  // ==========================================================================
  // CONTRACTS
  // ==========================================================================

  private async deployContracts(): Promise<void> {
    const contracts = [
      "CampaignRegistry",
      "EscrowVault",
      "PledgeManager",
      "OracleRegistry",
      "PledgeToken",
      "CommemorativeToken",
    ];

    const deployer = this.state.accounts[0];
    let baseAddress = 0x5fbdb2315678afecb367f032d93f642f64180aa3n;

    for (const name of contracts) {
      this.state.contracts.push({
        name,
        address: `0x${baseAddress.toString(16)}`,
        abi: [], // Simplified
        deployedAt: this.state.blockNumber,
      });

      deployer.nonce++;
      baseAddress += 1n;
      this.mineBlock();
    }
  }

  getContract(name: string): SandboxContract | undefined {
    return this.state.contracts.find((c) => c.name === name);
  }

  getContracts(): SandboxContract[] {
    return [...this.state.contracts];
  }

  // ==========================================================================
  // CAMPAIGNS
  // ==========================================================================

  private async seedData(): Promise<void> {
    // Create sample campaigns
    const templates = [
      {
        name: "Portland Marathon 2026 - Test",
        goal: "10000000000000000000", // 10 ETH
        milestones: [
          {
            name: "Race Registration",
            oracleQuery: "registration_verified",
            releasePercent: 20,
          },
          {
            name: "Race Completion",
            oracleQuery: "race_completed",
            releasePercent: 80,
          },
        ],
      },
      {
        name: "Open Source Feature - Test",
        goal: "5000000000000000000", // 5 ETH
        milestones: [
          { name: "PR Merged", oracleQuery: "pr_merged", releasePercent: 50 },
          {
            name: "Deployed",
            oracleQuery: "deployed_production",
            releasePercent: 50,
          },
        ],
      },
      {
        name: "Album Release - Test",
        goal: "20000000000000000000", // 20 ETH
        milestones: [
          {
            name: "Demo Complete",
            oracleQuery: "demo_uploaded",
            releasePercent: 30,
          },
          {
            name: "Final Master",
            oracleQuery: "master_complete",
            releasePercent: 40,
          },
          {
            name: "Public Release",
            oracleQuery: "album_released",
            releasePercent: 30,
          },
        ],
      },
    ];

    for (let i = 0; i < templates.length; i++) {
      const template = templates[i];
      const creator = this.state.accounts[i + 1]; // Skip deployer
      const beneficiary = this.state.accounts[i + 3]; // Different account

      const campaign: SandboxCampaign = {
        id: `campaign_${(i + 1).toString().padStart(3, "0")}`,
        name: template.name,
        creator: creator.address,
        beneficiary: beneficiary.address,
        goal: template.goal,
        pledged: "0",
        status: "active",
        milestones: template.milestones.map((m, j) => ({
          id: `milestone_${i + 1}_${j + 1}`,
          name: m.name,
          oracleQuery: m.oracleQuery,
          releasePercent: m.releasePercent,
          verified: false,
        })),
      };

      this.state.campaigns.push(campaign);
      this.mineBlock();

      // Create sample pledges
      for (let j = 0; j < 3; j++) {
        const backer = this.state.accounts[5 + j];
        const amount = `${(j + 1)}000000000000000000`; // 1-3 ETH

        const pledge: SandboxPledge = {
          id: `pledge_${i + 1}_${j + 1}`,
          campaignId: campaign.id,
          backer: backer.address,
          amount,
          status: "active",
        };

        this.state.pledges.push(pledge);
        campaign.pledged = (
          BigInt(campaign.pledged) + BigInt(amount)
        ).toString();

        this.mineBlock();
      }
    }
  }

  createCampaign(params: {
    name: string;
    creator: string;
    beneficiary: string;
    goal: string;
    milestones: { name: string; oracleQuery: string; releasePercent: number }[];
  }): SandboxCampaign {
    const campaign: SandboxCampaign = {
      id: `campaign_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      name: params.name,
      creator: params.creator,
      beneficiary: params.beneficiary,
      goal: params.goal,
      pledged: "0",
      status: "active",
      milestones: params.milestones.map((m, i) => ({
        id: `milestone_${Date.now()}_${i}`,
        name: m.name,
        oracleQuery: m.oracleQuery,
        releasePercent: m.releasePercent,
        verified: false,
      })),
    };

    this.state.campaigns.push(campaign);
    this.mineBlock();

    return campaign;
  }

  getCampaign(id: string): SandboxCampaign | undefined {
    return this.state.campaigns.find((c) => c.id === id);
  }

  getCampaigns(): SandboxCampaign[] {
    return [...this.state.campaigns];
  }

  // ==========================================================================
  // PLEDGES
  // ==========================================================================

  createPledge(params: {
    campaignId: string;
    backer: string;
    amount: string;
  }): SandboxPledge {
    const campaign = this.getCampaign(params.campaignId);
    if (!campaign) {
      throw new Error("Campaign not found");
    }

    const pledge: SandboxPledge = {
      id: `pledge_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      campaignId: params.campaignId,
      backer: params.backer,
      amount: params.amount,
      status: "active",
    };

    this.state.pledges.push(pledge);
    campaign.pledged = (
      BigInt(campaign.pledged) + BigInt(params.amount)
    ).toString();

    this.mineBlock();

    return pledge;
  }

  getPledge(id: string): SandboxPledge | undefined {
    return this.state.pledges.find((p) => p.id === id);
  }

  getCampaignPledges(campaignId: string): SandboxPledge[] {
    return this.state.pledges.filter((p) => p.campaignId === campaignId);
  }

  // ==========================================================================
  // ORACLES (Mock)
  // ==========================================================================

  setOracleResponse(query: string, response: any): void {
    this.mockOracleResponses.set(query, response);
  }

  async queryOracle(query: string): Promise<any> {
    if (!this.config.mockOracles) {
      throw new Error("Mock oracles disabled");
    }

    const response = this.mockOracleResponses.get(query);
    if (response !== undefined) {
      return response;
    }

    // Default mock responses
    const defaults: Record<string, any> = {
      registration_verified: { verified: true, timestamp: Date.now() },
      race_completed: { verified: true, distance: 26.2, time: "3:47:22" },
      pr_merged: { verified: true, prNumber: 123, merged: true },
      deployed_production: { verified: true, version: "1.0.0" },
      demo_uploaded: { verified: true, url: "https://demo.example.com" },
      master_complete: { verified: true, tracks: 12 },
      album_released: { verified: true, platform: "spotify", date: Date.now() },
    };

    return defaults[query] || { verified: false, error: "Unknown query" };
  }

  // ==========================================================================
  // MILESTONES
  // ==========================================================================

  async verifyMilestone(
    campaignId: string,
    milestoneId: string
  ): Promise<SandboxMilestone> {
    const campaign = this.getCampaign(campaignId);
    if (!campaign) {
      throw new Error("Campaign not found");
    }

    const milestone = campaign.milestones.find((m) => m.id === milestoneId);
    if (!milestone) {
      throw new Error("Milestone not found");
    }

    // Query mock oracle
    const result = await this.queryOracle(milestone.oracleQuery);

    milestone.verified = result.verified === true;
    this.mineBlock();

    return milestone;
  }

  // ==========================================================================
  // RESOLUTION
  // ==========================================================================

  async resolveCampaign(campaignId: string): Promise<{
    campaign: SandboxCampaign;
    released: string;
    refunded: string;
  }> {
    const campaign = this.getCampaign(campaignId);
    if (!campaign) {
      throw new Error("Campaign not found");
    }

    // Calculate release based on verified milestones
    let releasePercent = 0;
    for (const milestone of campaign.milestones) {
      if (milestone.verified) {
        releasePercent += milestone.releasePercent;
      }
    }

    const pledged = BigInt(campaign.pledged);
    const released = (pledged * BigInt(releasePercent)) / 100n;
    const refunded = pledged - released;

    campaign.status = releasePercent === 100 ? "resolved" : "partial";

    // Update pledges
    for (const pledge of this.getCampaignPledges(campaignId)) {
      if (releasePercent === 100) {
        pledge.status = "released";
      } else if (releasePercent === 0) {
        pledge.status = "refunded";
      } else {
        pledge.status = "partial";
      }
    }

    this.mineBlock();

    return {
      campaign,
      released: released.toString(),
      refunded: refunded.toString(),
    };
  }

  // ==========================================================================
  // BLOCKCHAIN SIMULATION
  // ==========================================================================

  private mineBlock(): void {
    this.state.blockNumber++;
    this.state.timestamp = Date.now();
  }

  private startAutoMining(): void {
    if (!this.config.autoMine) return;

    setInterval(() => {
      if (this.state.running) {
        this.mineBlock();
      }
    }, this.config.blockTime * 1000);
  }

  mineBlocks(count: number): void {
    for (let i = 0; i < count; i++) {
      this.mineBlock();
    }
  }

  advanceTime(seconds: number): void {
    this.state.timestamp += seconds * 1000;
    this.mineBlock();
  }

  getBlockNumber(): number {
    return this.state.blockNumber;
  }

  getTimestamp(): number {
    return this.state.timestamp;
  }

  // ==========================================================================
  // SNAPSHOTS
  // ==========================================================================

  snapshot(): string {
    const snapshotId = `snap_${Date.now()}`;
    // In production: store full state
    return snapshotId;
  }

  revert(snapshotId: string): void {
    // In production: restore state from snapshot
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function createSandbox(config?: Partial<SandboxConfig>): Sandbox {
  return new Sandbox(config);
}
