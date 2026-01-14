/**
 * Oracle System Types
 * Phase 2: API Oracle Framework
 */

export type OracleType = "attestation" | "api" | "aggregator";

export type TrustLevel = "official" | "verified" | "community" | "custom";

export interface OracleConfig {
  id: string;
  name: string;
  description: string;
  type: OracleType;
  trustLevel: TrustLevel;
  active: boolean;

  // API Oracle specific
  endpoint?: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  authType?: "none" | "api_key" | "oauth" | "bearer";

  // Query configuration
  queryMapping?: Record<string, string>;  // Map internal params to API params
  responseMapping?: Record<string, string>; // Map API response to internal schema

  // Retry and timeout
  timeout?: number;
  retries?: number;
  retryDelay?: number;

  // Polling configuration
  pollInterval?: number;  // ms between polls (0 = webhook only)

  // Attestation specific
  attestor?: string;
  requiredSignatures?: number;

  // Aggregator specific
  sources?: string[];
  aggregationMethod?: "all" | "majority" | "any";
}

export interface OracleQuery {
  oracleId: string;
  campaignId: string;
  milestoneId: string;
  params: Record<string, any>;
}

export interface OracleResponse {
  success: boolean;
  data: any;
  rawData?: any;
  timestamp: number;
  source: string;
  cached: boolean;
  error?: string;
}

export interface MilestoneCondition {
  type: "completion" | "threshold" | "range" | "custom";
  field: string;
  operator: "exists" | "eq" | "gt" | "gte" | "lt" | "lte" | "between";
  value: any;
  valueEnd?: any;
}

export interface VerificationResult {
  milestoneId: string;
  campaignId: string;
  verified: boolean;
  oracleData: any;
  evaluatedCondition: MilestoneCondition;
  timestamp: number;
  error?: string;
}

export interface WebhookPayload {
  oracleId: string;
  eventType: string;
  data: any;
  signature?: string;
  timestamp: number;
}

// Race timing specific types
export interface RaceResult {
  status: "finished" | "dnf" | "dns" | "pending";
  timeSeconds?: number;
  distanceMiles?: number;
  pacePerMile?: number;
  placementOverall?: number;
  placementDivision?: number;
  bibNumber: string;
  runnerName?: string;
}

// GitHub specific types
export interface GitHubPRResult {
  prMerged: boolean;
  commitInMain: boolean;
  testsPassing: boolean;
  mergedAt?: number;
  prNumber: number;
  repo: string;
}

// Academic verification types
export interface AcademicResult {
  enrolled: boolean;
  creditsCompleted?: number;
  gpa?: number;
  graduationDate?: string;
  degreeConferred?: string;
}

// Resolution types
export interface ResolutionJob {
  id: string;
  campaignId: string;
  status: "pending" | "processing" | "completed" | "failed";
  triggeredBy: "manual" | "webhook" | "poll" | "schedule";
  createdAt: number;
  processedAt?: number;
  result?: ResolutionResult;
  error?: string;
}

export interface ResolutionResult {
  campaignId: string;
  milestonesVerified: number;
  milestonesFailed: number;
  pledgesResolved: number;
  totalReleased: string;
  totalRefunded: string;
  commemorativesMinted: number;
}
