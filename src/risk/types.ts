/**
 * Phase 9: Risk Assessment Types
 *
 * Fraud detection, creator verification, and trust scoring.
 */

// ============================================================================
// VERIFICATION
// ============================================================================

export type VerificationStatus =
  | "unverified"
  | "pending"
  | "in_review"
  | "verified"
  | "rejected"
  | "expired";

export type VerificationLevel = "basic" | "standard" | "enhanced" | "premium";

export type VerificationType =
  | "email"
  | "phone"
  | "identity"
  | "address"
  | "social"
  | "business";

export interface VerificationRecord {
  id: string;
  userAddress: string;
  type: VerificationType;
  status: VerificationStatus;
  level: VerificationLevel;

  // Verified data (hashed/partial)
  verifiedData?: {
    emailHash?: string;
    phoneHash?: string;
    nameHash?: string;
    countryCode?: string;
    documentType?: string;
  };

  // Provider
  provider?: string;
  providerVerificationId?: string;

  // Dates
  requestedAt: number;
  submittedAt?: number;
  verifiedAt?: number;
  expiresAt?: number;

  // Rejection
  rejectionReason?: string;
  appealable: boolean;
}

export interface VerificationSummary {
  userAddress: string;
  overallLevel: VerificationLevel;
  verifications: Record<VerificationType, VerificationStatus>;
  badges: Badge[];
  trustScore: number;
  lastUpdated: number;
}

// ============================================================================
// BADGES
// ============================================================================

export type BadgeType =
  | "verified_identity" // KYC verified
  | "verified_email" // Email verified
  | "verified_phone" // Phone verified
  | "verified_social" // Social media verified
  | "top_creator" // Top performing creator
  | "top_backer" // Top backer
  | "early_adopter" // Early platform user
  | "community_leader" // Active in community
  | "dispute_resolver" // Arbitrator role
  | "milestone_master"; // 100% milestone success

export interface Badge {
  id: string;
  type: BadgeType;
  name: string;
  description: string;
  imageUrl?: string;
  earnedAt: number;
  expiresAt?: number;
}

// ============================================================================
// TRUST SCORES
// ============================================================================

export interface TrustScore {
  userAddress: string;
  score: number; // 0-100
  tier: TrustTier;

  // Score breakdown
  factors: TrustFactor[];

  // History
  history: TrustScoreChange[];

  // Stats
  campaignsCreated: number;
  campaignsSuccessful: number;
  campaignsFailed: number;
  pledgesMade: number;
  pledgesHonored: number;
  disputesWon: number;
  disputesLost: number;

  calculatedAt: number;
}

export type TrustTier = "new" | "basic" | "trusted" | "established" | "elite";

export interface TrustFactor {
  name: string;
  weight: number; // 0-1
  score: number; // 0-100
  reason: string;
}

export interface TrustScoreChange {
  timestamp: number;
  previousScore: number;
  newScore: number;
  reason: string;
  relatedEntity?: string;
}

export const TRUST_TIER_THRESHOLDS: Record<TrustTier, number> = {
  new: 0,
  basic: 20,
  trusted: 40,
  established: 60,
  elite: 80,
};

// ============================================================================
// RISK ASSESSMENT
// ============================================================================

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RiskAssessment {
  id: string;
  entityType: "campaign" | "pledge" | "user" | "transaction";
  entityId: string;

  // Overall risk
  riskLevel: RiskLevel;
  riskScore: number; // 0-100 (higher = riskier)
  confidence: number; // 0-1

  // Signals
  signals: RiskSignal[];

  // Action
  recommendedAction: RiskAction;
  autoActioned: boolean;

  // Timing
  assessedAt: number;
  expiresAt: number;
}

export type RiskAction =
  | "approve" // No action needed
  | "flag" // Flag for review
  | "review" // Manual review required
  | "hold" // Hold pending investigation
  | "reject" // Auto-reject
  | "suspend"; // Suspend account/campaign

export interface RiskSignal {
  type: RiskSignalType;
  severity: RiskLevel;
  description: string;
  score: number; // Contribution to overall risk
  evidence?: Record<string, any>;
}

export type RiskSignalType =
  // Account signals
  | "new_account" // Recently created account
  | "unverified_account" // No verification
  | "suspicious_address" // Flagged address
  | "multiple_accounts" // Suspected sybil
  | "geographic_mismatch" // Location inconsistency
  // Campaign signals
  | "unrealistic_goal" // Implausible funding goal
  | "short_deadline" // Very short campaign
  | "no_milestones" // Missing milestone verification
  | "vague_description" // Poor campaign details
  | "copied_content" // Plagiarized content
  | "suspicious_category" // High-risk category
  // Transaction signals
  | "rapid_funding" // Unusually fast funding
  | "round_amounts" // Suspicious round numbers
  | "self_funding" // Creator funding own campaign
  | "related_parties" // Related addresses funding
  | "velocity_spike" // Sudden activity spike
  // Behavior signals
  | "pattern_match" // Matches fraud pattern
  | "blacklist_match" // On blocklist
  | "previous_fraud" // Prior fraud association
  | "dispute_history"; // High dispute rate

// ============================================================================
// FRAUD RULES
// ============================================================================

export interface FraudRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;

  // Conditions
  entityType: "campaign" | "pledge" | "user" | "transaction";
  conditions: RuleCondition[];
  combinator: "all" | "any"; // AND vs OR

  // Actions
  riskLevel: RiskLevel;
  action: RiskAction;
  autoAction: boolean;

  // Statistics
  triggeredCount: number;
  falsePositiveCount: number;
  lastTriggeredAt?: number;

  createdAt: number;
  updatedAt: number;
}

export interface RuleCondition {
  field: string;
  operator: ConditionOperator;
  value: any;
}

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "greater_than"
  | "less_than"
  | "contains"
  | "not_contains"
  | "in"
  | "not_in"
  | "exists"
  | "not_exists"
  | "regex";

// ============================================================================
// ALERTS
// ============================================================================

export type AlertSeverity = "info" | "warning" | "error" | "critical";

export type AlertStatus = "open" | "acknowledged" | "resolved" | "dismissed";

export interface RiskAlert {
  id: string;
  severity: AlertSeverity;
  status: AlertStatus;

  // Context
  entityType: string;
  entityId: string;
  assessmentId: string;

  // Details
  title: string;
  description: string;
  signals: RiskSignal[];
  recommendedAction: RiskAction;

  // Resolution
  resolvedAt?: number;
  resolvedBy?: string;
  resolution?: string;
  actionTaken?: RiskAction;

  // Timing
  createdAt: number;
  acknowledgedAt?: number;
  acknowledgedBy?: string;
}

// ============================================================================
// BLOCKLISTS
// ============================================================================

export interface BlocklistEntry {
  id: string;
  type: "address" | "email" | "ip" | "domain" | "content";
  value: string;
  valueHash?: string; // For hashed entries

  reason: string;
  severity: RiskLevel;

  // Source
  source: "manual" | "automated" | "external";
  addedBy?: string;
  externalSource?: string;

  // Dates
  addedAt: number;
  expiresAt?: number;
  removedAt?: number;
  removedBy?: string;
}

// ============================================================================
// REPORTS
// ============================================================================

export interface RiskReport {
  id: string;
  period: {
    start: number;
    end: number;
  };

  // Assessments
  totalAssessments: number;
  assessmentsByLevel: Record<RiskLevel, number>;
  assessmentsByEntity: Record<string, number>;

  // Alerts
  totalAlerts: number;
  alertsBySeverity: Record<AlertSeverity, number>;
  alertsResolved: number;
  averageResolutionTime: number;

  // Actions
  actionsTaken: Record<RiskAction, number>;
  autoActioned: number;
  manualReviewed: number;

  // False positives
  falsePositiveRate: number;
  rulesTriggered: Record<string, number>;

  generatedAt: number;
}
