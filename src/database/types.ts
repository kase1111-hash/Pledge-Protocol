/**
 * Domain types and storage interface for the Pledge Protocol API.
 *
 * Amounts are wei, carried as non-negative integer strings so they never pass
 * through floating point. Timestamps are unix seconds.
 */

export type CampaignStatus =
  | "draft"
  | "active"
  | "pledging_closed"
  | "resolved"
  | "expired"
  | "cancelled";

export type CampaignVisibility = "public" | "semi-private" | "private";

export type MilestoneStatus = "pending" | "verified" | "failed" | "expired";

export type ConditionOperator = "exists" | "eq" | "gt" | "gte" | "lt" | "lte" | "between";

export interface Subject {
  name: string;
  identifier: string;
  verificationSource: string;
}

export interface MilestoneCondition {
  type: "completion" | "threshold" | "range" | "custom";
  field: string;
  operator: ConditionOperator;
  value: string | number | boolean | null;
  valueEnd?: number;
}

export interface Milestone {
  id: string;
  name: string;
  description: string;
  oracleId: string;
  /** Parameters passed to the oracle when verifying (e.g. race ID, bib number) */
  oracleParams: Record<string, unknown>;
  condition: MilestoneCondition;
  releasePercentage: number;
  status: MilestoneStatus;
  verifiedAt: number | null;
  oracleData: unknown;
}

export interface Tier {
  threshold: number;
  rate: string;
}

export interface PledgeCondition {
  field: string;
  operator: ConditionOperator;
  value?: number;
  valueEnd?: number;
}

export type CalculationType = "flat" | "per_unit" | "tiered" | "conditional";

export interface PledgeType {
  id: string;
  name: string;
  description: string;
  calculationType: CalculationType;
  baseAmount: string | null;
  perUnitAmount: string | null;
  unitField: string | null;
  cap: string | null;
  tiers: Tier[] | null;
  condition: PledgeCondition | null;
  minimum: string;
  maximum: string | null;
  enabled: boolean;
}

export interface Campaign {
  id: string;
  chainId: string | null;
  name: string;
  description: string;
  creator: string;
  beneficiary: string;
  beneficiaryName: string;
  subject: Subject | null;
  pledgeWindowStart: number;
  pledgeWindowEnd: number;
  eventDate: number | null;
  resolutionDeadline: number;
  milestones: Milestone[];
  pledgeTypes: PledgeType[];
  minimumPledge: string;
  maximumPledge: string | null;
  status: CampaignStatus;
  totalEscrowed: string;
  totalReleased: string;
  totalRefunded: string;
  /** Number of pledges currently active (not cancelled) */
  pledgeCount: number;
  visibility: CampaignVisibility;
  metadataUri: string;
  createdAt: number;
  updatedAt: number;
  resolvedAt: number | null;
}

export type PledgeStatus = "active" | "resolved" | "refunded" | "cancelled";

export interface Pledge {
  id: string;
  chainId: string | null;
  campaignId: string;
  pledgeTypeId: string;
  backer: string;
  backerName: string | null;
  escrowedAmount: string;
  /** Amount released to the beneficiary on resolution */
  finalAmount: string | null;
  /** Amount returned to the backer on resolution or cancellation */
  refundedAmount: string | null;
  status: PledgeStatus;
  createdAt: number;
  resolvedAt: number | null;
  tokenId: string | null;
  commemorativeId: string | null;
}

export type OracleType = "api" | "attestation" | "aggregator";
export type TrustLevel = "official" | "verified" | "community" | "custom";

export interface Oracle {
  id: string;
  name: string;
  description: string;
  type: OracleType;
  /** Address allowed to submit attestations (attestation oracles only) */
  attestor: string | null;
  endpoint: string | null;
  trustLevel: TrustLevel;
  active: boolean;
  config: Record<string, unknown> | null;
  createdAt: number;
}

export interface Attestation {
  id: string;
  oracleId: string;
  campaignId: string;
  milestoneId: string;
  completed: boolean;
  value: number | null;
  evidenceUri: string | null;
  notes: string | null;
  attestor: string;
  signature: string;
  submittedAt: number;
}

export interface Page<T> {
  items: T[];
  total: number;
}

export interface CampaignQuery {
  status?: CampaignStatus;
  visibility?: CampaignVisibility;
  creator?: string;
  limit?: number;
  offset?: number;
}

export interface PledgeQuery {
  campaignId?: string;
  backer?: string;
  status?: PledgeStatus;
  limit?: number;
  offset?: number;
}

/**
 * Read/write operations available both directly on the store and inside a
 * transaction. Returned objects are copies: callers must save() changes.
 */
export interface StoreSession {
  /**
   * With forUpdate, the row is locked until the enclosing transaction ends, so
   * concurrent read-modify-write cycles on the same campaign serialize.
   */
  getCampaign(id: string, options?: { forUpdate?: boolean }): Promise<Campaign | null>;
  listCampaigns(query?: CampaignQuery): Promise<Page<Campaign>>;
  saveCampaign(campaign: Campaign): Promise<void>;

  getPledge(id: string, options?: { forUpdate?: boolean }): Promise<Pledge | null>;
  listPledges(query?: PledgeQuery): Promise<Page<Pledge>>;
  savePledge(pledge: Pledge): Promise<void>;

  getOracle(id: string): Promise<Oracle | null>;
  listOracles(): Promise<Oracle[]>;
  saveOracle(oracle: Oracle): Promise<void>;

  getAttestation(campaignId: string, milestoneId: string): Promise<Attestation | null>;
  /** Inserts an attestation; returns false if one already exists for the milestone */
  insertAttestation(attestation: Attestation): Promise<boolean>;
}

export interface DomainStore extends StoreSession {
  readonly kind: "memory" | "postgresql";
  /** Runs fn atomically: all writes commit together or not at all */
  transaction<T>(fn: (session: StoreSession) => Promise<T>): Promise<T>;
  isConnected(): Promise<boolean>;
  close(): Promise<void>;
}
