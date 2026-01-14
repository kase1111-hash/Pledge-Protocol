/**
 * Pledge Protocol SDK Types
 * Phase 8: Ecosystem Expansion - TypeScript SDK for developers
 */

import { ChainId } from "../multichain/config";

// ============================================================================
// BASE TYPES
// ============================================================================

/**
 * Ethereum address type
 */
export type Address = `0x${string}`;

/**
 * Transaction hash type
 */
export type TransactionHash = `0x${string}`;

/**
 * Block number
 */
export type BlockNumber = number;

/**
 * Unix timestamp in milliseconds
 */
export type Timestamp = number;

/**
 * Amount in wei (string for bigint serialization)
 */
export type WeiAmount = string;

// ============================================================================
// CAMPAIGN TYPES
// ============================================================================

/**
 * Campaign status
 */
export type CampaignStatus =
  | "draft"
  | "active"
  | "paused"
  | "resolved"
  | "cancelled"
  | "expired";

/**
 * Campaign category
 */
export type CampaignCategory =
  | "fitness"
  | "creative"
  | "education"
  | "opensource"
  | "business"
  | "research"
  | "charity"
  | "other";

/**
 * Campaign milestone
 */
export interface Milestone {
  id: string;
  name: string;
  description: string;
  targetDate: Timestamp;
  oracleId: string;
  verified: boolean;
  verifiedAt?: Timestamp;
  verificationData?: Record<string, any>;
  releasePercentage: number;
}

/**
 * Campaign data
 */
export interface Campaign {
  id: string;
  name: string;
  description: string;
  category: CampaignCategory;
  status: CampaignStatus;
  creator: Address;
  beneficiary: Address;
  goalAmount: WeiAmount;
  totalPledged: WeiAmount;
  backerCount: number;
  pledgeCount: number;
  milestones: Milestone[];
  deadline: Timestamp;
  createdAt: Timestamp;
  activatedAt?: Timestamp;
  resolvedAt?: Timestamp;
  metadata?: {
    imageUrl?: string;
    websiteUrl?: string;
    socialLinks?: Record<string, string>;
    tags?: string[];
  };
  chainDeployments?: {
    chainId: ChainId;
    contractAddress: Address;
    escrowAddress: Address;
  }[];
}

/**
 * Campaign creation request
 */
export interface CreateCampaignRequest {
  name: string;
  description: string;
  category: CampaignCategory;
  beneficiary: Address;
  goalAmount: WeiAmount;
  deadline: Timestamp;
  milestones: Omit<Milestone, "id" | "verified" | "verifiedAt" | "verificationData">[];
  metadata?: Campaign["metadata"];
  deployToChains?: ChainId[];
}

/**
 * Campaign update request
 */
export interface UpdateCampaignRequest {
  name?: string;
  description?: string;
  metadata?: Campaign["metadata"];
}

// ============================================================================
// PLEDGE TYPES
// ============================================================================

/**
 * Pledge status
 */
export type PledgeStatus =
  | "pending"
  | "escrowed"
  | "partially_released"
  | "released"
  | "refunded"
  | "cancelled";

/**
 * Pledge calculation type
 */
export type PledgeCalculationType = "flat" | "per_unit" | "tiered" | "conditional";

/**
 * Conditional operator
 */
export type ConditionalOperator =
  | "exists"
  | "eq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between";

/**
 * Tiered rate definition
 */
export interface TieredRate {
  threshold: number;
  rate: WeiAmount;
}

/**
 * Pledge calculation configuration
 */
export interface PledgeCalculation {
  type: PledgeCalculationType;

  // Flat pledge
  baseAmount?: WeiAmount;

  // Per-unit pledge
  perUnitAmount?: WeiAmount;
  unitField?: string;

  // Tiered pledge
  tiers?: TieredRate[];

  // Conditional pledge
  condition?: {
    field: string;
    operator: ConditionalOperator;
    value?: any;
    valueEnd?: any;
  };

  // Common
  cap?: WeiAmount;
  minimum?: WeiAmount;
}

/**
 * Pledge data
 */
export interface Pledge {
  id: string;
  campaignId: string;
  backer: Address;
  status: PledgeStatus;
  calculation: PledgeCalculation;
  escrowedAmount: WeiAmount;
  releasedAmount: WeiAmount;
  refundedAmount: WeiAmount;
  chainId: ChainId;
  transactionHash?: TransactionHash;
  tokenId?: string;
  commemorativeId?: string;
  createdAt: Timestamp;
  escrowedAt?: Timestamp;
  resolvedAt?: Timestamp;
}

/**
 * Pledge creation request
 */
export interface CreatePledgeRequest {
  campaignId: string;
  calculation: PledgeCalculation;
  chainId?: ChainId;
}

// ============================================================================
// ORACLE TYPES
// ============================================================================

/**
 * Oracle provider type
 */
export type OracleProviderType =
  | "api"
  | "race_timing"
  | "github"
  | "strava"
  | "academic"
  | "streaming"
  | "aggregator"
  | "manual";

/**
 * Oracle status
 */
export type OracleStatus = "active" | "inactive" | "error";

/**
 * Oracle configuration
 */
export interface Oracle {
  id: string;
  name: string;
  providerType: OracleProviderType;
  status: OracleStatus;
  config: Record<string, any>;
  lastQueryAt?: Timestamp;
  lastResponseAt?: Timestamp;
  errorCount: number;
}

/**
 * Oracle query result
 */
export interface OracleQueryResult {
  oracleId: string;
  timestamp: Timestamp;
  success: boolean;
  data?: Record<string, any>;
  error?: string;
  cached: boolean;
}

// ============================================================================
// DISPUTE TYPES
// ============================================================================

/**
 * Dispute status
 */
export type DisputeStatus =
  | "pending"
  | "reviewing"
  | "voting"
  | "escalated"
  | "resolved"
  | "appealed"
  | "closed";

/**
 * Dispute category
 */
export type DisputeCategory =
  | "oracle_disagreement"
  | "oracle_failure"
  | "milestone_dispute"
  | "calculation_error"
  | "fraud_claim"
  | "technical_issue"
  | "other";

/**
 * Resolution tier
 */
export type ResolutionTier = "automated" | "community" | "creator" | "council";

/**
 * Vote option
 */
export type VoteOption = "release" | "refund" | "partial" | "abstain";

/**
 * Dispute data
 */
export interface Dispute {
  id: string;
  campaignId: string;
  pledgeId?: string;
  milestoneId?: string;
  status: DisputeStatus;
  category: DisputeCategory;
  tier: ResolutionTier;
  title: string;
  description: string;
  raisedBy: Address;
  raisedAt: Timestamp;
  resolution?: {
    outcome: VoteOption;
    rationale: string;
    resolvedBy: Address;
    resolvedAt: Timestamp;
    partialPercentage?: number;
  };
}

/**
 * Create dispute request
 */
export interface CreateDisputeRequest {
  campaignId: string;
  pledgeId?: string;
  milestoneId?: string;
  category: DisputeCategory;
  title: string;
  description: string;
}

// ============================================================================
// COMMEMORATIVE TYPES
// ============================================================================

/**
 * Commemorative token data
 */
export interface Commemorative {
  id: string;
  pledgeId: string;
  campaignId: string;
  backer: Address;
  tokenId: string;
  imageUrl: string;
  metadataUrl: string;
  mintedAt: Timestamp;
  chainId: ChainId;
  transactionHash?: TransactionHash;
  attributes: {
    campaignName: string;
    contributionAmount: WeiAmount;
    outcomeSummary: string;
    backedAt: Timestamp;
    resolvedAt: Timestamp;
  };
}

// ============================================================================
// USER TYPES
// ============================================================================

/**
 * User profile
 */
export interface UserProfile {
  address: Address;
  name?: string;
  avatar?: string;
  bio?: string;
  socialLinks?: Record<string, string>;
  createdAt: Timestamp;
  stats: {
    campaignsCreated: number;
    campaignsBacked: number;
    totalPledged: WeiAmount;
    totalRaised: WeiAmount;
    successRate: number;
  };
  badges?: string[];
}

// ============================================================================
// SDK CONFIGURATION
// ============================================================================

/**
 * SDK configuration options
 */
export interface SDKConfig {
  apiUrl: string;
  chainId?: ChainId;
  apiKey?: string;
  sessionId?: string;
  timeout?: number;
  retries?: number;
}

/**
 * API response wrapper
 */
export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  requestId?: string;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * List options for pagination and filtering
 */
export interface ListOptions {
  page?: number;
  limit?: number;
  sort?: string;
  order?: "asc" | "desc";
}

/**
 * Campaign list options
 */
export interface CampaignListOptions extends ListOptions {
  status?: CampaignStatus;
  category?: CampaignCategory;
  creator?: Address;
  chainId?: ChainId;
  query?: string;
  tags?: string[];
  minPledged?: WeiAmount;
  maxPledged?: WeiAmount;
}

/**
 * Pledge list options
 */
export interface PledgeListOptions extends ListOptions {
  campaignId?: string;
  backer?: Address;
  status?: PledgeStatus;
  chainId?: ChainId;
}
