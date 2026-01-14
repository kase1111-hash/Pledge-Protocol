/**
 * Phase 9: Developer Tools Types
 *
 * CLI, sandbox, and test fixture types.
 */

// ============================================================================
// CLI TYPES
// ============================================================================

export interface CliConfig {
  apiUrl: string;
  chainId: number;
  apiKey?: string;
  sessionId?: string;
  verbose: boolean;
  outputFormat: "json" | "table" | "yaml";
}

export interface CliCommand {
  name: string;
  description: string;
  aliases?: string[];
  options: CliOption[];
  action: (args: Record<string, any>, config: CliConfig) => Promise<void>;
}

export interface CliOption {
  name: string;
  alias?: string;
  description: string;
  type: "string" | "number" | "boolean" | "array";
  required?: boolean;
  default?: any;
}

// ============================================================================
// SANDBOX TYPES
// ============================================================================

export interface SandboxConfig {
  port: number;
  chainId: number;
  autoMine: boolean;
  blockTime: number; // seconds
  accountsCount: number;
  initialBalance: string;
  mockOracles: boolean;
  seedData: boolean;
}

export interface SandboxState {
  running: boolean;
  port: number;
  chainId: number;
  accounts: SandboxAccount[];
  contracts: SandboxContract[];
  campaigns: SandboxCampaign[];
  pledges: SandboxPledge[];
  blockNumber: number;
  timestamp: number;
}

export interface SandboxAccount {
  address: string;
  privateKey: string;
  balance: string;
  nonce: number;
  label?: string;
}

export interface SandboxContract {
  name: string;
  address: string;
  abi: any[];
  deployedAt: number;
}

export interface SandboxCampaign {
  id: string;
  name: string;
  creator: string;
  beneficiary: string;
  goal: string;
  pledged: string;
  status: string;
  milestones: SandboxMilestone[];
}

export interface SandboxMilestone {
  id: string;
  name: string;
  oracleQuery: string;
  releasePercent: number;
  verified: boolean;
}

export interface SandboxPledge {
  id: string;
  campaignId: string;
  backer: string;
  amount: string;
  status: string;
}

// ============================================================================
// TEST FIXTURES
// ============================================================================

export interface TestFixtures {
  accounts: TestAccount[];
  campaigns: TestCampaign[];
  pledges: TestPledge[];
  oracles: TestOracle[];
}

export interface TestAccount {
  name: string;
  address: string;
  privateKey: string;
  role: "creator" | "backer" | "beneficiary" | "oracle";
}

export interface TestCampaign {
  id: string;
  template: string;
  name: string;
  description: string;
  creator: string;
  beneficiary: string;
  goal: string;
  deadline: number;
  milestones: TestMilestone[];
}

export interface TestMilestone {
  name: string;
  oracleType: string;
  oracleQuery: Record<string, any>;
  releasePercent: number;
}

export interface TestPledge {
  campaignId: string;
  backer: string;
  amount: string;
  calculationType: string;
  params?: Record<string, any>;
}

export interface TestOracle {
  id: string;
  type: string;
  mockResponse: Record<string, any>;
}

// ============================================================================
// SIMULATION TYPES
// ============================================================================

export interface SimulationConfig {
  campaign: TestCampaign;
  pledges: TestPledge[];
  oracleResponses: Record<string, any>[];
  timeAdvance?: number; // seconds to advance
}

export interface SimulationResult {
  success: boolean;
  steps: SimulationStep[];
  finalState: {
    campaignStatus: string;
    totalPledged: string;
    totalReleased: string;
    pledgeStatuses: Record<string, string>;
  };
  errors: string[];
  gasUsed: string;
  executionTimeMs: number;
}

export interface SimulationStep {
  step: number;
  action: string;
  description: string;
  success: boolean;
  result?: any;
  error?: string;
  gasUsed?: string;
  timestamp: number;
}

// ============================================================================
// PROJECT SCAFFOLD
// ============================================================================

export interface ProjectScaffold {
  name: string;
  template: "basic" | "full" | "minimal";
  features: ScaffoldFeature[];
  chainIds: number[];
}

export type ScaffoldFeature =
  | "campaigns"
  | "pledges"
  | "oracles"
  | "commemoratives"
  | "disputes"
  | "webhooks"
  | "analytics";

export interface ScaffoldFile {
  path: string;
  content: string;
  template?: string;
}
