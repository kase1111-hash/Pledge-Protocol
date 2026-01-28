/**
 * Database Types
 * Type definitions for persistent storage entities
 */

export interface CampaignEntity {
  id: string;
  chainId?: string;
  creatorAddress: string;
  beneficiaryAddress: string;
  subjectName: string;
  beneficiaryName: string;
  category: string;
  description?: string;
  goalAmount?: string;
  fundingDeadline?: number;
  resolutionDeadline?: number;
  status: "draft" | "active" | "pledges_closed" | "resolved" | "expired" | "cancelled";
  totalPledged: string;
  totalReleased: string;
  totalRefunded: string;
  createdAt: number;
  activatedAt?: number;
  resolvedAt?: number;
  milestones?: MilestoneEntity[];
  pledgeTypes?: PledgeTypeEntity[];
}

export interface PledgeEntity {
  id: string;
  chainId?: string;
  campaignId: string;
  pledgeTypeId: string;
  backerAddress: string;
  backerName?: string;
  escrowedAmount: string;
  finalAmount?: string;
  status: "active" | "resolved" | "refunded" | "cancelled";
  calculationParams?: Record<string, unknown>;
  createdAt: number;
  resolvedAt?: number;
}

export interface PledgeTypeEntity {
  id: string;
  campaignId: string;
  name: string;
  description?: string;
  calculationType: "flat" | "per_unit" | "tiered" | "conditional";
  minAmount?: string;
  maxAmount?: string;
  unitRate?: string;
  maxUnits?: number;
  createdAt: number;
}

export interface MilestoneEntity {
  id: string;
  campaignId: string;
  oracleId?: string;
  name: string;
  description?: string;
  verificationType: string;
  conditionConfig: Record<string, unknown>;
  weight: number;
  verified: boolean;
  verifiedAt?: number;
  oracleData?: Record<string, unknown>;
  createdAt: number;
}

export interface OracleEntity {
  id: string;
  name: string;
  description?: string;
  oracleType: "attestation" | "api" | "aggregator";
  trustLevel: "official" | "verified" | "community" | "custom";
  active: boolean;
  endpoint?: string;
  authConfig?: Record<string, unknown>;
  queryMapping?: Record<string, unknown>;
  responseMapping?: Record<string, unknown>;
  pollInterval?: number;
  createdAt: number;
}

export interface CommemorativeEntity {
  id: string;
  pledgeId: string;
  campaignId: string;
  backerAddress: string;
  tokenId?: number;
  templateType: "race_finish" | "academic" | "creative" | "generic";
  metadata: Record<string, unknown>;
  imageUri: string;
  metadataUri: string;
  storageProvider: "ipfs" | "arweave";
  minted: boolean;
  mintedAt?: number;
  txHash?: string;
  createdAt: number;
}

export interface ResolutionJobEntity {
  id: string;
  campaignId: string;
  status: "pending" | "processing" | "completed" | "failed";
  triggeredBy: "manual" | "webhook" | "poll" | "schedule";
  milestonesVerified: number;
  milestonesFailed: number;
  pledgesResolved: number;
  totalReleased: string;
  totalRefunded: string;
  commemorativesMinted: number;
  errorMessage?: string;
  startedAt?: number;
  completedAt?: number;
  createdAt: number;
}

/**
 * Query options for listing entities
 */
export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDir?: "asc" | "desc";
}

/**
 * Campaign filter options
 */
export interface CampaignFilter extends QueryOptions {
  status?: string | string[];
  category?: string;
  creatorAddress?: string;
  beneficiaryAddress?: string;
}

/**
 * Pledge filter options
 */
export interface PledgeFilter extends QueryOptions {
  campaignId?: string;
  backerAddress?: string;
  status?: string | string[];
}

/**
 * Repository interface for CRUD operations
 */
export interface Repository<T, F = QueryOptions> {
  findById(id: string): Promise<T | null>;
  findAll(filter?: F): Promise<T[]>;
  create(entity: Omit<T, "id" | "createdAt">): Promise<T>;
  update(id: string, updates: Partial<T>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
  count(filter?: F): Promise<number>;
}

/**
 * Database service interface
 */
export interface IDatabaseService {
  campaigns: Repository<CampaignEntity, CampaignFilter>;
  pledges: Repository<PledgeEntity, PledgeFilter>;
  oracles: Repository<OracleEntity, QueryOptions>;
  commemoratives: Repository<CommemorativeEntity, QueryOptions>;
  resolutionJobs: Repository<ResolutionJobEntity, QueryOptions>;

  // Health check
  isConnected(): Promise<boolean>;

  // Transaction support (optional)
  transaction?<T>(fn: () => Promise<T>): Promise<T>;

  // Cleanup (for testing)
  clear?(): Promise<void>;
}
