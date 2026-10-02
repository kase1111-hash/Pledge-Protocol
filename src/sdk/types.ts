/**
 * Pledge Protocol SDK Types
 *
 * Campaign, pledge and oracle shapes are the API's own domain types, so the
 * SDK and the server cannot drift apart. Amounts are wei as integer strings;
 * timestamps are unix seconds unless noted otherwise.
 */

import { ChainId } from "../multichain/config";
import type {
  Campaign,
  CampaignStatus,
  CampaignVisibility,
  MilestoneCondition,
  Oracle as OracleRecord,
  Pledge,
  PledgeCondition,
  PledgeStatus,
  Subject,
  Tier,
  CalculationType,
} from "../database/types";
import type { UserProfile as SocialUserProfile } from "../social/types";
import type {
  Dispute as DisputeRecord,
  DisputeCategory,
  DisputeStatus,
  ResolutionTier,
  VoteOption,
} from "../governance/types";

export type {
  Attestation,
  CalculationType,
  Campaign,
  CampaignStatus,
  CampaignVisibility,
  ConditionOperator,
  Milestone,
  MilestoneCondition,
  MilestoneStatus,
  Pledge,
  PledgeCondition,
  PledgeStatus,
  PledgeType,
  Subject,
  Tier,
} from "../database/types";
export type { DisputeCategory, DisputeStatus, ResolutionTier, VoteOption } from "../governance/types";

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
 * Amount in wei (string for bigint serialization)
 */
export type WeiAmount = string;

// ============================================================================
// CAMPAIGNS
// ============================================================================

/**
 * Campaign creation request (POST /v1/campaigns)
 */
export interface CreateCampaignRequest {
  name: string;
  description: string;
  beneficiary: Address;
  beneficiaryName: string;
  subject?: Subject | null;
  pledgeWindowStart: number;
  pledgeWindowEnd: number;
  eventDate?: number | null;
  resolutionDeadline: number;
  milestones: {
    name: string;
    description: string;
    /** A registered oracle (GET /v1/oracles) */
    oracleId: string;
    oracleParams?: Record<string, unknown>;
    condition: MilestoneCondition;
    /** Percentages across all milestones must sum to 100 */
    releasePercentage: number;
  }[];
  pledgeTypes: {
    name: string;
    description: string;
    calculationType: CalculationType;
    baseAmount?: WeiAmount | null;
    perUnitAmount?: WeiAmount | null;
    unitField?: string | null;
    cap?: WeiAmount | null;
    tiers?: Tier[] | null;
    condition?: PledgeCondition | null;
    minimum: WeiAmount;
    maximum?: WeiAmount | null;
  }[];
  minimumPledge: WeiAmount;
  maximumPledge?: WeiAmount | null;
  visibility?: CampaignVisibility;
}

export interface CampaignStats {
  campaignId: string;
  totalEscrowed: WeiAmount;
  totalReleased: WeiAmount;
  totalRefunded: WeiAmount;
  pledgeCount: number;
  milestonesCompleted: number;
  milestonesTotal: number;
}

export interface CampaignResolution {
  id: string;
  status: CampaignStatus;
  resolution: {
    totalReleased: WeiAmount;
    totalRefunded: WeiAmount;
    pledgesResolved: number;
    milestonesVerified: number;
    milestonesFailed: number;
  };
  milestones: { id: string; status: string }[];
}

export interface MilestoneVerification {
  campaignId: string;
  milestoneId: string;
  verified: boolean;
  status: "verified" | "pending";
  oracleData: unknown;
  error?: string;
}

// ============================================================================
// PLEDGES
// ============================================================================

/**
 * Pledge creation request (POST /v1/pledges)
 */
export interface CreatePledgeRequest {
  campaignId: string;
  /** One of the campaign's pledge types, e.g. "pt_0" */
  pledgeTypeId: string;
  /** Amount to escrow, in wei */
  amount: WeiAmount;
  backerName?: string | null;
}

/**
 * Pledge as returned by the pledge endpoints
 */
export type PledgeView = Omit<Pledge, "chainId" | "tokenId"> & {
  token: { tokenId: string; imageUri: string } | null;
};

export interface CancelPledgeResult {
  id: string;
  status: PledgeStatus;
  refundedAmount: WeiAmount;
  refundTxHash: TransactionHash | null;
}

// ============================================================================
// ORACLES
// ============================================================================

/**
 * Oracle as returned by the API (its config is never exposed)
 */
export type Oracle = Omit<OracleRecord, "config">;

/**
 * Oracle query result
 */
export interface OracleQueryResult {
  success: boolean;
  data: Record<string, unknown> | null;
  timestamp?: number;
  source?: string;
  cached: boolean;
  error?: string;
  message?: string;
}

/**
 * Attestation submission (POST /v1/oracles/attestations). The signed-in
 * account must be the attestor of the milestone's oracle.
 */
export interface SubmitAttestationRequest {
  campaignId: string;
  milestoneId: string;
  completed: boolean;
  value?: number | null;
  evidenceUri?: string | null;
  notes?: string | null;
  signature?: string;
}

export interface AttestationResult {
  attestationId: string;
  milestoneId: string;
  milestoneStatus: "verified" | "failed";
  submittedAt: number;
}

// ============================================================================
// DISPUTES
// ============================================================================

/**
 * Dispute as returned by the API (bigint amounts serialized as strings)
 */
export type Dispute = Omit<DisputeRecord, "totalEscrowedAmount" | "voteTally"> & {
  totalEscrowedAmount: WeiAmount;
  voteTally?: Record<string, unknown>;
};

/**
 * Create dispute request
 */
export interface CreateDisputeRequest {
  campaignId: string;
  pledgeIds?: string[];
  milestoneId?: string;
  category: DisputeCategory;
  title: string;
  description: string;
  initialEvidence?: DisputeEvidence[];
}

export interface DisputeEvidence {
  type: "document" | "screenshot" | "api_response" | "attestation" | "link" | "text";
  title: string;
  description: string;
  content: string;
  contentHash?: string;
}

/**
 * A vote on a dispute. The voter is the signed-in account and its voting
 * power is the one assigned when voting opened.
 */
export interface CastVoteRequest {
  vote: VoteOption;
  partialPercent?: number;
  reason?: string;
}

// ============================================================================
// COMMEMORATIVES
// ============================================================================

/**
 * Commemorative token record
 */
export interface Commemorative {
  id: string;
  pledgeId: string;
  campaignId: string;
  backerAddress: Address;
  imageUri: string;
  metadataUri: string;
  imageUrl: string;
  metadataUrl: string;
  storageProvider: "ipfs" | "arweave";
  minted: boolean;
  tokenId?: number;
  txHash?: TransactionHash;
  /** Milliseconds */
  mintedAt?: number;
  /** Milliseconds */
  createdAt: number;
  metadata: Record<string, unknown>;
}

/**
 * Commemorative as listed per campaign or backer (a subset of the record)
 */
export type CommemorativeSummary = Pick<
  Commemorative,
  "id" | "pledgeId" | "imageUrl" | "metadataUrl" | "minted" | "tokenId"
>;

// ============================================================================
// USERS
// ============================================================================

/**
 * User profile (preferences only appear on your own profile)
 */
export type UserProfile = Omit<SocialUserProfile, "preferences"> & {
  preferences?: SocialUserProfile["preferences"];
};

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
  /** Human-readable error message */
  error?: string;
  /** Machine-readable error code, e.g. "CAMPAIGN_NOT_FOUND" */
  code?: string;
  /** HTTP status of a failed request (absent for network errors) */
  status?: number;
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
 * List options for pagination (pages start at 1; limit is at most 100)
 */
export interface ListOptions {
  page?: number;
  limit?: number;
}

/**
 * Campaign list options. Only public campaigns are listed.
 */
export interface CampaignListOptions extends ListOptions {
  status?: CampaignStatus;
  creator?: Address;
}

/**
 * Pledge list options
 */
export interface PledgeListOptions extends ListOptions {
  campaignId?: string;
  backer?: Address;
  status?: PledgeStatus;
}
